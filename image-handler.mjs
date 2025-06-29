// image-handler.mjs
import { createRequire } from 'module';
import { Boom } from '@hapi/boom';
import P from 'pino';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { fileURLToPath } from 'url';
import { setupGroupContext } from './gpt-image-parser.mjs';
import OpenAI from 'openai';
import axios from 'axios';
import FormData from 'form-data';
import qrcode from 'qrcode-terminal';
import vision from '@google-cloud/vision';

const require = createRequire(import.meta.url);
const baileys = require('@whiskeysockets/baileys');
const { useMultiFileAuthState, DisconnectReason, makeWASocket, downloadMediaMessage } = baileys;

// إعداد البيئة
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionFolder = path.join(__dirname, 'image-auth');
const uploadFolder = path.join(__dirname, 'whatsappuploads');
fs.mkdirSync(uploadFolder, { recursive: true });

// تهيئة مفتاح Google Vision قبل استدعاء الكائن
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'gcp-vision-key.json');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const visionClient = new vision.ImageAnnotatorClient();
const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
const sessions = {};

const extractTextFromImage = async (imagePath) => {
  const [result] = await visionClient.textDetection(imagePath);
  return result.textAnnotations?.[0]?.description || '';
};

const formatPrompt = (rawText) => {
  return `
النص:
${rawText}
`;
};

const startBot = async () => {
  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
  });

  console.log('🚀 بدأ تشغيل البوت...');

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('📱 امسح كود QR التالي لتسجيل الدخول:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : 0) !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === 'connecting') {
      console.log('🔄 يتم الاتصال الآن...');
    } else if (connection === 'open') {
      console.log('✅ تم الاتصال بواتساب!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    
    if (!messages || !messages[0]) return;
        const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    let content = msg.message;
    if (content?.ephemeralMessage) {
      content = content.ephemeralMessage.message;
    }


    const sender = msg.key.remoteJid;
    const allowedGroup = '120363408270173007@g.us';
    if (sender !== allowedGroup) return;
    if (!sessions[sender]) {
      const context = await setupGroupContext(sender);
      sessions[sender] = { ...context };
    }

    const { threadId, assistantId } = sessions[sender];
    // قبل إرسال أي رسالة جديدة إلى threadId
const existingRuns = await openai.beta.threads.runs.list(threadId);
const isActiveRun = existingRuns.data.some(run => ['queued', 'in_progress'].includes(run.status));

if (isActiveRun) {
  await sock.sendMessage(sender, { text: '⚠️ لا يمكن إرسال صورة جديدة الآن، يرجى الانتظار حتى انتهاء المعالجة الحالية.' });
  return;
}

    try {
      const mediaMsg = content?.imageMessage || content?.documentMessage;
const text = content?.conversation || content?.extendedTextMessage?.text;


      if (mediaMsg) {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
          logger: P().child({ level: 'silent' }),
          reuploadRequest: sock.updateMediaMessage
        });

        const mimeType = mediaMsg.mimetype || 'application/octet-stream';
        const extension = mime.extension(mimeType) || 'bin';
        const filename = `wa_${Date.now()}.${extension}`;
        const fullPath = path.join(uploadFolder, filename);
        fs.writeFileSync(fullPath, buffer);

        if (mimeType.startsWith('image/')) {
          const extractedText = await extractTextFromImage(fullPath);
          const formattedPrompt = formatPrompt(extractedText);

          await openai.beta.threads.messages.create(threadId, {
            role: 'user',
            content: formattedPrompt
          });

        } else {
          await openai.beta.threads.messages.create(threadId, {
            role: 'user',
            content: `📎 تم رفع الملف: ${filename}`
          });
        }

      } else if (text) {
        await openai.beta.threads.messages.create(threadId, {
          role: 'user',
          content: text
        });
      }

      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId
      });

      let status = run.status;
      while (status === 'queued' || status === 'in_progress') {
        await new Promise(res => setTimeout(res, 2000));
        const updatedRun = await openai.beta.threads.runs.retrieve(threadId, run.id);
        status = updatedRun.status;
      }

      const messagesList = await openai.beta.threads.messages.list(threadId);
      const last = messagesList.data.find(msg => msg.role === 'assistant');
      const result = last?.content[0]?.text?.value || '❓ لم يتم العثور على رد.';

      await sock.sendMessage(sender, { text: result });

    } catch (err) {
      console.error('❌ خطأ:', err);
      await sock.sendMessage(sender, { text: '❌ حدث خطأ أثناء المعالجة.' });
    }
  });

  sock.ev.on('creds.update', saveCreds);
};

startBot();
