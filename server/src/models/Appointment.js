import mongoose from 'mongoose';

// Appointment — a scheduled slot booked by a customer/client and assigned to a staff member.
// Supports: scheduled, confirmed, completed, cancelled, no_show statuses.
const appointmentSchema = new mongoose.Schema(
  {
    // Customer / client who books the appointment
    customerName: { type: String, required: true, trim: true, maxlength: 200 },
    customerEmail: { type: String, trim: true, lowercase: true, maxlength: 200, default: '', index: true },
    customerPhone: { type: String, trim: true, maxlength: 50, default: '' },

    // Optional link to an existing User (member) record, when the booker is a known user
    customerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // The staff member who will handle the appointment
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedToName: { type: String, default: '' }, // snapshot

    // When the appointment is scheduled for
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true, index: true },
    // Duration in minutes (derived but stored for fast filter)
    durationMin: { type: Number, default: 30, min: 5, max: 480 },

    // Topic / reason
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 2000 },
    location: { type: String, default: '', maxlength: 200 }, // 'Oficina CDMX', 'Google Meet', etc.

    // Status
    status: {
      type: String,
      enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'],
      default: 'scheduled',
      index: true,
    },

    // Free-form notes from staff after the meeting
    staffNotes: { type: String, default: '', maxlength: 2000 },

    // Where the booking came from — useful for the landing-page analytics
    source: { type: String, default: 'landing' }, // 'landing' | 'admin' | 'phone' | 'manual'
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

appointmentSchema.index({ startsAt: 1, assignedTo: 1 });
appointmentSchema.index({ assignedTo: 1, status: 1, startsAt: 1 });
appointmentSchema.index({ customerUser: 1, startsAt: -1 });

appointmentSchema.pre('validate', function (next) {
  if (this.startsAt && this.endsAt && this.endsAt <= this.startsAt) {
    return next(new Error('La hora de fin debe ser posterior a la de inicio'));
  }
  if (this.startsAt && this.endsAt) {
    this.durationMin = Math.max(5, Math.round((this.endsAt - this.startsAt) / 60000));
  }
  next();
});

export const Appointment = mongoose.model('Appointment', appointmentSchema);
export default Appointment;
