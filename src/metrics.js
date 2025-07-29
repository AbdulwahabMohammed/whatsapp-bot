const client = require('prom-client');

client.collectDefaultMetrics();

const requestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const connectionGauge = new client.Gauge({
  name: 'whatsapp_connection_status',
  help: 'WhatsApp connection status for each organization',
  labelNames: ['org_id'],
});

module.exports = {
  client,
  requestCounter,
  connectionGauge,
};
