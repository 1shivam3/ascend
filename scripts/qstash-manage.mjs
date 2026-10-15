import { Client } from '@upstash/qstash';
import fs from 'fs';
import path from 'path';

// Load .env.local if present
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
} catch {}

const token = process.env.QSTASH_TOKEN?.trim();

if (!token) {
  console.error('Error: QSTASH_TOKEN is not configured in environment or .env.local');
  process.exit(1);
}

const client = new Client({ token });
const action = process.argv[2] || 'list';

async function main() {
  switch (action) {
    case 'list': {
      console.log('Fetching active QStash schedules...');
      const schedules = await client.schedules.list();
      console.log(JSON.stringify(schedules, null, 2));
      break;
    }

    case 'trigger': {
      const targetUrl = process.argv[3] || 'https://ascendtonext.vercel.app/api/notifications/dispatch';
      console.log(`Publishing immediate trigger to ${targetUrl}...`);
      const res = await client.publishJSON({
        url: targetUrl,
        body: {},
      });
      console.log('Triggered successfully:', res);
      break;
    }

    case 'create': {
      const destination = process.argv[3] || 'https://ascendtonext.vercel.app/api/notifications/dispatch';
      const cron = process.argv[4] || '*/15 * * * *';
      console.log(`Creating schedule: ${cron} -> ${destination}...`);
      const res = await client.schedules.create({
        destination,
        cron,
      });
      console.log('Schedule created:', res);
      break;
    }

    case 'pause': {
      const scheduleId = process.argv[3];
      if (!scheduleId) {
        console.error('Usage: node scripts/qstash-manage.mjs pause <scheduleId>');
        process.exit(1);
      }
      await client.schedules.pause({ schedule: scheduleId });
      console.log(`Paused schedule ${scheduleId}`);
      break;
    }

    case 'resume': {
      const scheduleId = process.argv[3];
      if (!scheduleId) {
        console.error('Usage: node scripts/qstash-manage.mjs resume <scheduleId>');
        process.exit(1);
      }
      await client.schedules.resume({ schedule: scheduleId });
      console.log(`Resumed schedule ${scheduleId}`);
      break;
    }

    case 'delete': {
      const scheduleId = process.argv[3];
      if (!scheduleId) {
        console.error('Usage: node scripts/qstash-manage.mjs delete <scheduleId>');
        process.exit(1);
      }
      await client.schedules.delete(scheduleId);
      console.log(`Deleted schedule ${scheduleId}`);
      break;
    }

    default: {
      console.log(`Unknown action: ${action}. Available: list, trigger, create, pause, resume, delete`);
    }
  }
}

main().catch(err => {
  console.error('QStash Error:', err.message || err);
  process.exit(1);
});
