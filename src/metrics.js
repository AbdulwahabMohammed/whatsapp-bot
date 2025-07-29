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

const queueLengthGauge = new client.Gauge({
  name: 'queue_length',
  help: 'Number of messages waiting in the queue',
});

const messageCounter = new client.Counter({
  name: 'whatsapp_messages_total',
  help: 'Total number of WhatsApp messages processed',
  labelNames: ['org_id', 'direction'],
});

module.exports = {
  client,
  requestCounter,
  connectionGauge,
  messageCounter,
  queueLengthGauge,
};
