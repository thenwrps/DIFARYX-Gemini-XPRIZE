import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, CloudOff } from 'lucide-react';
import { getAgentApiUrl } from '../services/api/agentApiUrl';
import { checkXrdBackendHealth } from '../services/xrdBackendClient';

export type XrdStatus = 'connected' | 'processing' | 'offline' | 'error';
export type AgentStatus = 'connected' | 'fallback' | 'processing' | 'offline' | 'error';

interface HealthCache {
  xrdStatus: XrdStatus;
  agentStatus: AgentStatus;
  timestamp: number;
}

const CACHE_KEY = 'difaryx_backend_health_cache';
const TTL_MS = 10_000; // 10 seconds TTL

export function useBackendStatus(
  isProcessingAgent: boolean,
  isProcessingXrd: boolean,
  lastAgentFallback: boolean
) {
  const [xrdStatus, setXrdStatus] = useState<XrdStatus>('offline');
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('offline');

  const checkHealth = useCallback(async (force = false) => {
    // Check cache
    if (!force) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed: HealthCache = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < TTL_MS) {
            setXrdStatus(parsed.xrdStatus);
            setAgentStatus(parsed.agentStatus);
            return;
          }
        }
      } catch (e) {
        // Ignore cache parse error
      }
    }

    let nextXrd: XrdStatus = 'offline';
    let nextAgent: AgentStatus = 'offline';

    // 1. XRD health check
    const xrdUrlConfigured = Boolean(
      import.meta.env.VITE_XRD_API_URL || import.meta.env.VITE_XRD_BACKEND_URL,
    );
    if (xrdUrlConfigured) {
      try {
        const res = await checkXrdBackendHealth();
        if (res.ok) {
          nextXrd = 'connected';
        } else {
          nextXrd = 'offline';
        }
      } catch {
        nextXrd = 'offline';
      }
    }

    // 2. Agent health check
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(getAgentApiUrl('/api/health'), { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.providerConfigured === true && !lastAgentFallback) {
          nextAgent = 'connected';
        } else {
          nextAgent = 'fallback';
        }
      } else {
        nextAgent = 'offline';
      }
    } catch {
      nextAgent = 'offline';
    }

    setXrdStatus(nextXrd);
    setAgentStatus(nextAgent);

    // Save to cache
    try {
      const cacheData: HealthCache = {
        xrdStatus: nextXrd,
        agentStatus: nextAgent,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
      // Ignore localStorage write error
    }
  }, [lastAgentFallback]);

  // Periodic refresh
  useEffect(() => {
    checkHealth();
    const interval = setInterval(() => {
      checkHealth();
    }, 10000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Map to processing state if active
  const displayXrd = isProcessingXrd ? 'processing' : xrdStatus;
  const displayAgent = isProcessingAgent ? 'processing' : agentStatus;

  return {
    xrdStatus: displayXrd,
    agentStatus: displayAgent,
    refresh: () => checkHealth(true),
  };
}

export function BackendStatusBadge({
  type,
  status,
}: {
  type: 'XRD' | 'Agent';
  status: XrdStatus | AgentStatus;
}) {
  const configs = {
    connected: {
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dot: 'bg-emerald-500',
      icon: CheckCircle2,
      label: 'Connected',
    },
    processing: {
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      dot: 'bg-blue-500 animate-pulse',
      icon: Loader2,
      label: 'Processing',
    },
    fallback: {
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      dot: 'bg-amber-500',
      icon: AlertTriangle,
      label: 'Fallback',
    },
    offline: {
      color: 'bg-slate-50 text-slate-600 border-slate-200',
      dot: 'bg-slate-400',
      icon: CloudOff,
      label: 'Offline',
    },
    error: {
      color: 'bg-red-50 text-red-700 border-red-200',
      dot: 'bg-red-500',
      icon: AlertTriangle,
      label: 'Error',
    },
  };

  const config = configs[status as keyof typeof configs] || configs.offline;
  const Icon = config.icon;

  return (
    <div
      className={`h-7 px-2 flex items-center gap-1.5 border rounded text-[10px] font-bold shadow-sm transition-all ${config.color}`}
      title={`${type} Backend Status: ${config.label}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      <span>{type}: {config.label}</span>
      {status === 'processing' && <Icon className="h-3 w-3 animate-spin text-blue-700" />}
    </div>
  );
}
