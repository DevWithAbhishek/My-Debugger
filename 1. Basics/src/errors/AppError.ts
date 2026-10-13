export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthenticated: (msg = 'Authentication required') => new AppError(401, 'UNAUTHENTICATED', msg),
  invalidToken: () => new AppError(401, 'INVALID_TOKEN', 'Access token is invalid'),
  tokenExpired: () => new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired'),
  forbiddenRole: () => new AppError(403, 'FORBIDDEN_ROLE', 'Your role is not allowed to do this'),
  teamDenied: () => new AppError(403, 'TEAM_ACCESS_DENIED', 'You do not have access to this team'),
  notFound: (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`),
};
