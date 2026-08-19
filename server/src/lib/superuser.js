// lib/superuser.js — centralized "can see/manage all rows" check.
//
// Every controller that filters by `owner: req.user._id` (or by project
// membership) hides rows that an admin should still be able to see. Wrap
// any hard-filter with `isSuperUser(req.user)` and add a `||` bypass so
// admins/staff see everything.
//
// Why a helper, not inline checks: keeps role policy in one place. If
// "staff should NOT see all rows" changes to "staff should see only their
// projects", you change one file.

export function isSuperUser(user) {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'staff';
}

export default isSuperUser;