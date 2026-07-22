import 'dotenv/config';
import { createApp } from './app';
import { loadServerConfig } from './config';

const config = loadServerConfig();
const app = createApp({ config });

app.listen(config.port, config.host, () => {
  console.log(JSON.stringify({
    event: 'server_started',
    requestId: null,
    route: `${config.host}:${config.port}`,
    status: 200,
    durationMs: 0,
    provider: 'vertex-gemini',
    model: config.geminiModel,
    fallbackUsed: false,
  }));
});
