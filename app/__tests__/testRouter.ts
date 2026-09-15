/**
 * The router spies and route params the `expo-router` mock in `jest.setup.js`
 * hands to every screen.
 *
 * Reached through `jest.requireMock` rather than by calling the hooks at module
 * scope, which would be hooks called outside a component. `requireActual` is not
 * an option: the real module is untransformed ESM and Jest cannot parse it.
 */
const mocked = jest.requireMock('expo-router') as {
  router: { push: jest.Mock; replace: jest.Mock; back: jest.Mock };
  setParams: (params: Record<string, string>) => void;
};

export const testRouter = mocked.router;
export const setRouteParams = mocked.setParams;
