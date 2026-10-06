// Deep links survive a trip through the login page: a logged-out visitor is
// sent to /login?next=<where they were going>, and login returns them there.

export const loginPathFor = (location) =>
  `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

export function postLoginPath(user, search) {
  const home = user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/dashboard';
  const next = new URLSearchParams(search).get('next');
  // Only ever follow a path on this site
  if (!next || !/^\/(?![/\\])/.test(next)) return home;
  // The forced password change prompt only lives on the dashboards
  if (user.mustChangePassword && !/^\/(dashboard|admin|teacher)([?#]|$)/.test(next)) return home;
  return next;
}
