"""Phase 0 - governance (REVISED): outbox with locked_at, expanded quota, technique-aware ingestion,
                                    AI policies + consent + reasoning runs with consent consistency

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-11 (v2)
"""
from alembic import op

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── outbox_events ────────────────────────────────────────────────────────
    # locked_at / locked_by support atomic claim with stale-lock reclamation.
    # Idempotency scoped by (organization_id, aggregate_type, aggregate_id, event_type).
    op.execute("""
        CREATE TABLE outbox.outbox_events (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            aggregate_type      TEXT        NOT NULL,
            aggregate_id        TEXT        NOT NULL,
            event_type          TEXT        NOT NULL,
            payload             JSONB       NOT NULL DEFAULT '{}',
            status              governance.outbox_status NOT NULL DEFAULT 'pending',
            attempt_count       INTEGER     NOT NULL DEFAULT 0,
            max_attempts        INTEGER     NOT NULL DEFAULT 5,
            locked_at           TIMESTAMPTZ,
            locked_by           TEXT,
            next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_attempt_at     TIMESTAMPTZ,
            last_error          TEXT,
            delivered_at        TIMESTAMPTZ,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            -- Org-scoped idempotency key (Issue #10)
            CONSTRAINT outbox_idempotency_uq UNIQUE (organization_id, aggregate_type, aggregate_id, event_type),
            -- A locked row must have both locked_at and locked_by set
            CONSTRAINT outbox_lock_consistency CHECK (
                (locked_at IS NULL) = (locked_by IS NULL)
            )
        )
    """)

    # ── outbox_dead_letter ───────────────────────────────────────────────────
    # FK to outbox_events retained so the dead event is traceable.
    # The outbox row is NOT deleted when DLQ entry is created.
    op.execute("""
        CREATE TABLE outbox.outbox_dead_letter (
            id                    UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id       UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            original_event_org_id UUID        NOT NULL,
            original_event_id     UUID        NOT NULL,
            aggregate_type        TEXT        NOT NULL,
            aggregate_id          TEXT        NOT NULL,
            event_type            TEXT        NOT NULL,
            payload               JSONB       NOT NULL DEFAULT '{}',
            final_error           TEXT,
            moved_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            -- FK to outbox_events (Issue #9) — ON DELETE RESTRICT prevents losing trace
            CONSTRAINT dlq_source_event_fk FOREIGN KEY (original_event_org_id, original_event_id)
                REFERENCES outbox.outbox_events(organization_id, id) ON DELETE RESTRICT
        )
    """)

    # ── quota_ledger ─────────────────────────────────────────────────────────
    # Expanded with: estimated_amount, settled_amount, released_amount,
    # settlement_key (idempotency), settled_at, released_at, quota_period label.
    op.execute("""
        CREATE TABLE governance.quota_ledger (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            quota_type          TEXT        NOT NULL,
            quota_period        TEXT        NOT NULL,
            period_start        DATE        NOT NULL,
            period_end          DATE        NOT NULL,
            allocated           BIGINT      NOT NULL DEFAULT 0,
            consumed            BIGINT      NOT NULL DEFAULT 0,
            reserved            BIGINT      NOT NULL DEFAULT 0,
            estimated_amount    BIGINT      NOT NULL DEFAULT 0,
            settled_amount      BIGINT      NOT NULL DEFAULT 0,
            released_amount     BIGINT      NOT NULL DEFAULT 0,
            release_reason      TEXT,
            settlement_key      TEXT,
            settled_at          TIMESTAMPTZ,
            released_at         TIMESTAMPTZ,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT quota_period_uq UNIQUE (organization_id, quota_type, period_start),
            CONSTRAINT quota_non_negative CHECK (consumed >= 0 AND reserved >= 0 AND allocated >= 0
                AND settled_amount >= 0 AND released_amount >= 0),
            CONSTRAINT quota_period_valid CHECK (period_start <= period_end)
        )
    """)

    # ── usage_events ─────────────────────────────────────────────────────────
    # Idempotency key prevents double-settlement on retry (Issue #11).
    op.execute("""
        CREATE TABLE governance.usage_events (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            quota_ledger_id     UUID        NOT NULL,
            ledger_org_id       UUID        NOT NULL,
            event_type          TEXT        NOT NULL
                CHECK (event_type IN ('reservation','settlement','release','cancellation')),
            amount              BIGINT      NOT NULL,
            idempotency_key     TEXT        NOT NULL,
            reference_id        TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT usage_ledger_fk FOREIGN KEY (ledger_org_id, quota_ledger_id)
                REFERENCES governance.quota_ledger(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT usage_idempotency_uq UNIQUE (organization_id, idempotency_key)
        )
    """)

    # ── ai_policies ──────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE governance.ai_policies (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            version         TEXT        NOT NULL,
            policy_document JSONB       NOT NULL DEFAULT '{}',
            effective_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            effective_until TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT ai_policies_version_uq UNIQUE (organization_id, version)
        )
    """)

    # ── ai_consent_records ───────────────────────────────────────────────────
    # The 4-column unique key (org, user, policy, id) enables a composite FK
    # from reasoning_runs proving consent belongs to that user+policy (Issue #7).
    op.execute("""
        CREATE TABLE governance.ai_consent_records (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            user_id             UUID        NOT NULL,
            ai_policy_id        UUID        NOT NULL,
            ai_policy_version   TEXT        NOT NULL,
            consent_scope       science.ai_consent_scope NOT NULL,
            consented_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            revoked_at          TIMESTAMPTZ,
            PRIMARY KEY (organization_id, id),
            -- Composite unique supports FK from reasoning_runs (org, user, policy, id)
            CONSTRAINT consent_user_policy_id_uq UNIQUE (organization_id, user_id, ai_policy_id, id),
            CONSTRAINT consent_user_policy_uq UNIQUE (organization_id, user_id, ai_policy_id),
            CONSTRAINT consent_user_fk FOREIGN KEY (organization_id, user_id)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT consent_policy_fk FOREIGN KEY (organization_id, ai_policy_id)
                REFERENCES governance.ai_policies(organization_id, id) ON DELETE RESTRICT
        )
    """)

    # ── reasoning_runs ───────────────────────────────────────────────────────
    # Composite FK enforces: consent.user_id == run.user_id
    #                        consent.ai_policy_id == run.ai_policy_id  (Issue #7)
    op.execute("""
        CREATE TABLE science.reasoning_runs (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            run_id              UUID        NOT NULL,
            user_id             UUID        NOT NULL,
            ai_policy_id        UUID        NOT NULL,
            ai_consent_id       UUID        NOT NULL,
            ai_consent_scope    science.ai_consent_scope NOT NULL,
            effective_policy_snapshot JSONB NOT NULL DEFAULT '{}',
            model_name          TEXT        NOT NULL,
            prompt_token_count  INTEGER,
            completion_token_count INTEGER,
            latency_ms          INTEGER,
            error_code          TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            CONSTRAINT reasoning_run_fk FOREIGN KEY (organization_id, run_id)
                REFERENCES science.analysis_runs(organization_id, id) ON DELETE RESTRICT,
            CONSTRAINT reasoning_user_fk FOREIGN KEY (organization_id, user_id)
                REFERENCES identity.users(organization_id, id) ON DELETE RESTRICT,
            -- Composite FK: proves consent belongs to THIS user AND policy (Issue #7)
            CONSTRAINT reasoning_consent_consistency_fk
                FOREIGN KEY (organization_id, user_id, ai_policy_id, ai_consent_id)
                REFERENCES governance.ai_consent_records(organization_id, user_id, ai_policy_id, id)
                ON DELETE RESTRICT
        )
    """)

    # ── ingestion_policies ───────────────────────────────────────────────────
    # Technique-aware, plan-aware, versioned with effective dates (Issue #12).
    op.execute("""
        CREATE TABLE governance.ingestion_policies (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id     UUID        NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
            plan                TEXT        NOT NULL DEFAULT 'free',
            technique           science.technique_code NOT NULL,
            parser_profile      TEXT        NOT NULL DEFAULT 'default',
            policy_version      TEXT        NOT NULL DEFAULT '1.0',
            max_file_size_bytes BIGINT      NOT NULL DEFAULT 104857600,
            allowed_extensions  JSONB       NOT NULL DEFAULT '[".csv",".txt",".xy",".dat"]',
            allowed_mime_types  JSONB       NOT NULL DEFAULT '["text/plain","text/csv"]',
            effective_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            effective_until     TIMESTAMPTZ,
            is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (organization_id, id),
            -- Unique per org+plan+technique+parser_profile combination (Issue #12)
            CONSTRAINT ingestion_policies_uq UNIQUE (organization_id, plan, technique, parser_profile, policy_version),
            CONSTRAINT ingestion_dates_valid CHECK (
                effective_until IS NULL OR effective_from <= effective_until
            )
        )
    """)

    # ── audit_log ────────────────────────────────────────────────────────────
    # actor_user_id nullable to allow pseudonymized tombstones after account deletion.
    # actor_tombstone_hash: SHA256 of original actor_id for correlation without PII.
    # organization_tombstone_hash: allows audit survival after org purge.
    op.execute("""
        CREATE TABLE governance.audit_log (
            id                          UUID        NOT NULL DEFAULT uuid_generate_v4(),
            organization_id             UUID,
            actor_user_id               UUID,
            actor_api_key_id            UUID,
            actor_tombstone_hash        TEXT,
            organization_tombstone_hash TEXT,
            action                      TEXT        NOT NULL,
            resource_type               TEXT        NOT NULL,
            resource_id                 TEXT        NOT NULL,
            change_delta                JSONB,
            ip_address                  INET,
            tombstoned                  BOOLEAN     NOT NULL DEFAULT FALSE,
            created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (id),
            -- Either a live org reference or a tombstone hash must exist
            CONSTRAINT audit_org_or_tombstone CHECK (
                organization_id IS NOT NULL OR organization_tombstone_hash IS NOT NULL
            )
        )
    """)

    # ── RLS ──────────────────────────────────────────────────────────────────
    outbox_tables = [('outbox', 'outbox_events'), ('outbox', 'outbox_dead_letter')]
    gov_tables = [
        ('governance', 'quota_ledger'), ('governance', 'usage_events'),
        ('governance', 'ai_policies'), ('governance', 'ai_consent_records'),
        ('governance', 'ingestion_policies'),
    ]
    science_tables = [('science', 'reasoning_runs')]

    for schema, tbl in outbox_tables + gov_tables + science_tables:
        op.execute(f'ALTER TABLE {schema}.{tbl} ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE {schema}.{tbl} FORCE ROW LEVEL SECURITY')
        op.execute(f"""
            CREATE POLICY {tbl}_tenant_isolation ON {schema}.{tbl}
                USING (organization_id = identity.current_organization_id())
        """)

    # audit_log uses tombstone-aware policy
    op.execute('ALTER TABLE governance.audit_log ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE governance.audit_log FORCE ROW LEVEL SECURITY')
    op.execute("""
        CREATE POLICY audit_log_tenant_isolation ON governance.audit_log
            USING (
                organization_id = identity.current_organization_id()
                OR (organization_id IS NULL
                    AND organization_tombstone_hash IS NOT NULL
                    AND identity.current_organization_id() IS NOT NULL)
            )
    """)

    # ── Indexes ──────────────────────────────────────────────────────────────
    op.execute("""
        CREATE INDEX ON outbox.outbox_events (status, next_attempt_at)
        WHERE status IN ('pending', 'failed')
    """)
    op.execute("""
        CREATE INDEX ON outbox.outbox_events (locked_at)
        WHERE locked_at IS NOT NULL
    """)
    op.execute('CREATE INDEX ON outbox.outbox_events (organization_id, aggregate_type, aggregate_id)')
    op.execute('CREATE INDEX ON governance.audit_log (organization_id, resource_type, resource_id)')
    op.execute('CREATE INDEX ON governance.audit_log (organization_id, created_at DESC)')
    op.execute('CREATE INDEX ON governance.quota_ledger (organization_id, quota_type, period_start)')
    op.execute('CREATE INDEX ON governance.usage_events (organization_id, idempotency_key)')
    op.execute('CREATE INDEX ON governance.ai_consent_records (organization_id, user_id, ai_policy_id)')


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS science.reasoning_runs CASCADE')
    for tbl in ('ingestion_policies', 'audit_log', 'ai_consent_records',
                'ai_policies', 'usage_events', 'quota_ledger'):
        op.execute(f'DROP TABLE IF EXISTS governance.{tbl} CASCADE')
    for tbl in ('outbox_dead_letter', 'outbox_events'):
        op.execute(f'DROP TABLE IF EXISTS outbox.{tbl} CASCADE')
