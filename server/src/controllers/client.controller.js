import Client from '../models/Client.js';
import { isSuperUser } from '../lib/superuser.js';

export async function listClients(req, res, next) {
  try {
    // Admins/staff see ALL clients; regular users only their own.
    // Without bypass, an admin who doesn't own a client sees [] and assumes "se borró la info".
    const filter = isSuperUser(req.user) ? {} : { owner: req.user._id };
    const clients = await Client.find(filter).sort({ createdAt: -1 });
    res.json(clients);
  } catch (err) { next(err); }
}

export async function createClient(req, res, next) {
  try {
    const client = await Client.create({ ...req.body, owner: req.user._id });
    res.status(201).json(client);
  } catch (err) { next(err); }
}

export async function updateClient(req, res, next) {
  try {
    // Admins/staff can edit any client; users only their own.
    const filter = isSuperUser(req.user)
      ? { _id: req.params.id }
      : { _id: req.params.id, owner: req.user._id };
    const client = await Client.findOneAndUpdate(
      filter,
      req.body,
      { new: true, runValidators: true }
    );
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json(client);
  } catch (err) { next(err); }
}

export async function deleteClient(req, res, next) {
  try {
    const filter = isSuperUser(req.user)
      ? { _id: req.params.id }
      : { _id: req.params.id, owner: req.user._id };
    const client = await Client.findOneAndDelete(filter);
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}
