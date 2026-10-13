import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../errors/asyncHandler.js';
import { legacyAuth } from '../middleware/legacyAuth.js';
import { assertTeamAccess } from '../middleware/authorize.js';
import type { IncidentService } from '../services/incidentService.js';

/** Routes kept alive for the pre-2.0 dashboard. Slated for removal. */
export function legacyRouter(incidents: IncidentService): Router {
  const router = Router();

  router.get(
    '/incidents/:id',
    legacyAuth(),
    asyncHandler(async (req, res) => {
      const incident = await incidents.getById(z.string().uuid().parse(req.params.id));
      assertTeamAccess(req.auth!, incident.teamId);
      res.json({ ok: true, incident });
    }),
  );

  return router;
}
