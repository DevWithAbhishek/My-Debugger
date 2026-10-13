// Shared helper for the dependency-outage reproduction scripts.
// Only ever runs `docker compose <start|stop|exec>` for ONE named service of THIS repo's docker-compose.yml.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep } from './http.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const compose = (process.env.COMPOSE_BIN ?? 'docker compose').split(' ');

export function dc(...args) {
  const r = spawnSync(compose[0], [...compose.slice(1), ...args], { cwd: root, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

export function requireCompose() {
  if (!dc('version').ok) {
    console.error(
      'Could not run `docker compose` (set COMPOSE_BIN if yours is named differently).\n' +
        'Manual alternative: stop/start the dependency yourself (e.g. `docker stop <container>` / `docker start <container>`),\n' +
        'then run the requests listed in the README troubleshooting section.',
    );
    process.exit(2);
  }
}

export async function waitHealthy(probe, label, tries = 30) {
  for (let i = 0; i < tries; i++) {
    if (dc(...probe).ok) return true;
    await sleep(1000);
  }
  console.error(`${label} did not become healthy in time; check \`docker compose ps\`.`);
  return false;
}
