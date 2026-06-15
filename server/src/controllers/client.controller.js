import Client from '../models/Client.js';

export async function listClients(req, res, next) {
  try {
    const clients = await Client.find({ owner: req.user._id }).sort({ createdAt: -1 });
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
    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json(client);
  } catch (err) { next(err); }
}

export async function deleteClient(req, res, next) {
  try {
    const client = await Client.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}
