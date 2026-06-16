// Restricts a route to specific roles.
// Usage: router.get('/users', requireAuth, requireRole('admin'), handler)
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        message: `Acceso denegado. Se requiere rol: ${allowed.join(' o ')}`
      });
    }
    next();
  };
}
