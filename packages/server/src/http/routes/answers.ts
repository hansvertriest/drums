import { SaveAnswersRequest, type AnswerSet } from '@drums/protocol';
import { Hono } from 'hono';
import type { RouteGroup } from '../route-group.js';
import { artifactParam, parseBody, workspaceParam } from '../validate.js';

export const answerRoutes: RouteGroup = {
  path: '/api/workspaces/:ws/artifacts/:id/answers',
  create({ services }) {
    return new Hono().put('/', async (c) => {
      const { version, answers } = await parseBody(c, SaveAnswersRequest);
      const set = await services.feedback.saveAnswers(workspaceParam(c), artifactParam(c), version, answers);
      return c.json(set satisfies AnswerSet);
    });
  },
};
