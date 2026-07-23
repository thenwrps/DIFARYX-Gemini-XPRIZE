import 'dotenv/config';
import { createApp } from './app';
import { loadServerConfig } from './config';
import { getGeminiProviderStatus } from './llm/providers/geminiProvider';

const config = loadServerConfig();
const geminiStatus = getGeminiProviderStatus(config);
const app = createApp({ config });

app.listen(config.port, config.host, () => {
  console.log(JSON.stringify({
    event: 'server_started',
    requestId: null,
    route: `${config.host}:${config.port}`,
    status: 200,
    durationMs: 0,
    provider: geminiStatus.provider,
    model: config.geminiModel,
    fallbackUsed: false,
  }));
});
