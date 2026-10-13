import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../errors/asyncHandler.js';
import { AppError } from '../errors/AppError.js';
import { authenticate } from '../middleware/authenticate.js';
import { assertTeamAccess, requireRole } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import type { IncidentService } from '../services/incidentService.js';
import type { AppContext } from '../types.js';

const IdParam = z.string().uuid();
const ListQuery = z.object({
  status: z.enum(['open', 'acknowledged', 'mitigated', 'resolved']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const CreateBody = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(4000).optional(),
  severity: z.enum(['sev1', 'sev2', 'sev3', 'sev4']),
  teamId: z.string().uuid().optional(),
});
const NoteBody = z.object({ body: z.string().min(1).max(2000) });

export function incidentsRouter(ctx: AppContext, incidents: IncidentService): Router {
  const router = Router();
  router.use(authenticate(ctx));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = ListQuery.parse(req.query);
      res.json({ items: await incidents.list(req.auth!, query) });
    }),
  );

  router.post(
    '/',
    requireRole('responder', 'admin'),
    validateBody(CreateBody),
    asyncHandler(async (req, res) => {
      if (req.auth!.role === 'admin' && !req.body.teamId) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Admins must specify teamId when creating an incident');
      }
      res.status(201).json(await incidents.create(req.auth!, req.body));
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const incident = await incidents.getById(IdParam.parse(req.params.id));
      assertTeamAccess(req.auth!, incident.teamId);
      res.json(incident);
    }),
  );

  router.patch(
    '/:id/status',
    requireRole('responder', 'admin'),
    asyncHandler(async (req, res) => {
      const existing = await incidents.getById(IdParam.parse(req.params.id));
      assertTeamAccess(req.auth!, existing.teamId);
      const { status } = req.body as { status: string };
      res.json(await incidents.setStatus(existing.id, status));
    }),
  );

  router.get(
    '/:id/notes',
    asyncHandler(async (req, res) => {
      res.json({ items: await incidents.listNotes(IdParam.parse(req.params.id)) });
    }),
  );

  router.post(
    '/:id/notes',
    requireRole('responder', 'admin'),
    validateBody(NoteBody),
    asyncHandler(async (req, res) => {
      const incident = await incidents.getById(IdParam.parse(req.params.id));
      assertTeamAccess(req.auth!, incident.teamId);
      res.status(201).json(await incidents.addNote(incident.id, req.auth!.userId, req.body.body));
    }),
  );

  return router;
}
