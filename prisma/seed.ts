import { PrismaClient, Role, AppointmentStatus, DayOfWeek, ServiceStatus, DentistStatus, PatientStatus, NotificationType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type Slot = { start: string; end: string };

// Weekly schedule helper
const schedule: Record<string, { start: string; end: string; breakStart: string | null; breakEnd: string | null } | null> = {
  MONDAY: { start: "09:00", end: "17:00", breakStart: "12:00", breakEnd: "13:00" },
  TUESDAY: { start: "09:00", end: "17:00", breakStart: "12:00", breakEnd: "13:00" },
  WEDNESDAY: { start: "09:00", end: "17:00", breakStart: "12:00", breakEnd: "13:00" },
  THURSDAY: { start: "09:00", end: "17:00", breakStart: "12:00", breakEnd: "13:00" },
  FRIDAY: { start: "09:00", end: "17:00", breakStart: "12:00", breakEnd: "13:00" },
  SATURDAY: { start: "10:00", end: "15:00", breakStart: null, breakEnd: null },
  SUNDAY: null,
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Generate all day slots for a schedule respecting breaks
function daySlots(daySchedule: NonNullable<(typeof schedule)[string]>): Slot[] {
  const slots: Slot[] = [];
  const open = toMinutes(daySchedule.start);
  const close = toMinutes(daySchedule.end);
  const breakStart = daySchedule.breakStart ? toMinutes(daySchedule.breakStart) : null;
  const breakEnd = daySchedule.breakEnd ? toMinutes(daySchedule.breakEnd) : null;

  let t = open;
  while (t + 30 <= close) {
    // Skip the lunch break window
    if (breakStart !== null && breakEnd !== null && t >= breakStart && t < breakEnd) {
      t = breakEnd;
      continue;
    }
    slots.push({ start: toHHMM(t), end: toHHMM(t + 30) });
    t += 30;
  }
  return slots;
}

async function main() {
  console.log("Seeding Aether Dental...");

  // --- Clean existing data (idempotent re-run) ---
  await prisma.emailLog.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.dentist.deleteMany();
  await prisma.service.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();
  await prisma.clinicSetting.deleteMany();

  // --- Clinic settings ---
  await prisma.clinicSetting.create({
    data: {
      id: "singleton",
      name: "Aether Dental Clinic",
      address: "123 Aether Ave., Bonifacio Global City, Taguig, Metro Manila",
      phone: "+63 2 8123 4567",
      email: "hello@aetherdental.ph",
      openingTime: "09:00",
      closingTime: "17:00",
      lunchBreakStart: "12:00",
      lunchBreakEnd: "13:00",
      defaultDurationMin: 30,
    },
  });

  // --- Services ---
  const services = [
    { name: "Dental Consultation", description: "Comprehensive oral examination and professional consultation.", durationMin: 30, price: new Prisma.Decimal("500.00") },
    { name: "Dental Cleaning", description: "Professional teeth cleaning and basic oral examination.", durationMin: 45, price: new Prisma.Decimal("1200.00") },
    { name: "Tooth Extraction", description: "Safe removal of problematic or impacted teeth.", durationMin: 45, price: new Prisma.Decimal("2000.00") },
    { name: "Dental Filling", description: "Tooth-colored composite fillings to restore damaged teeth.", durationMin: 40, price: new Prisma.Decimal("1500.00") },
    { name: "Root Canal Treatment", description: "Endodontic treatment to save an infected tooth.", durationMin: 90, price: new Prisma.Decimal("8000.00") },
    { name: "Teeth Whitening", description: "Professional in-clinic teeth whitening treatment.", durationMin: 60, price: new Prisma.Decimal("6000.00") },
    { name: "Dental Check-up", description: "Routine dental check-up and preventive screening.", durationMin: 30, price: new Prisma.Decimal("800.00") },
    { name: "Braces Consultation", description: "Orthodontic assessment and treatment planning.", durationMin: 45, price: new Prisma.Decimal("1000.00") },
  ];

  for (const s of services) {
    await prisma.service.create({ data: { ...s, status: ServiceStatus.ACTIVE } });
  }
  console.log(`Created ${services.length} services`);

  // --- Users ---
  function hash(pw: string) {
    return bcrypt.hashSync(pw, 10);
  }
  const adminUser = await prisma.user.create({
    data: { name: "Alex Ramos", email: "admin@aetherdental.ph", passwordHash: hash("admin123"), role: Role.ADMIN },
  });
  const receptionistUser = await prisma.user.create({
    data: { name: "Mia Cruz", email: "reception@aetherdental.ph", passwordHash: hash("reception123"), role: Role.RECEPTIONIST },
  });
  console.log("Created users: admin@aetherdental.ph / admin123, reception@aetherdental.ph / reception123");

  // --- Dentists ---
  const dentistDefs = [
    { name: "Dr. Maria Santos", email: "maria@aetherdental.ph", phone: "+63 917 111 1111", specialization: "General Dentistry" },
    { name: "Dr. Juan Cruz", email: "juan@aetherdental.ph", phone: "+63 917 222 2222", specialization: "Orthodontics" },
    { name: "Dr. Elena Reyes", email: "elena@aetherdental.ph", phone: "+63 917 333 3333", specialization: "Endodontics" },
    { name: "Dr. Paolo Dimagiba", email: "paolo@aetherdental.ph", phone: "+63 917 444 4444", specialization: "Oral Surgery" },
  ];

  const dentists: string[] = [];
  for (const d of dentistDefs) {
    const dentist = await prisma.dentist.create({
      data: { ...d, status: DentistStatus.ACTIVE },
    });
    dentists.push(dentist.id);

    // Availability per week
    for (const [day, sched] of Object.entries(schedule)) {
      if (!sched) {
        await prisma.availability.create({
          data: { dentistId: dentist.id, dayOfWeek: day as DayOfWeek, startTime: "00:00", endTime: "00:00", isWorking: false },
        });
        continue;
      }
      await prisma.availability.create({
        data: {
          dentistId: dentist.id,
          dayOfWeek: day as DayOfWeek,
          startTime: sched.start,
          endTime: sched.end,
          breakStart: sched.breakStart,
          breakEnd: sched.breakEnd,
          isWorking: true,
        },
      });
    }

    // Create a linked user for the dentist role (email/password login)
    const dentUser = `dentist.${d.name.replace(/[^a-z]/gi, "").toLowerCase().replace(/dr/g, "")}@aetherdental.ph`;
    await prisma.user.create({
      data: {
        name: d.name,
        email: dentUser,
        passwordHash: hash("dentist123"),
        role: Role.DENTIST,
      },
    });
  }
  console.log(`Created ${dentists.length} dentists`);

  // --- Patients ---
  // 25 patients that will receive appointments (indices 0-24)
  const firstNames = ["John", "Jane", "Mark", "Anna", "Luis", "Rosa", "Carlo", "Mia", "Pedro", "Nina", "Josh", "Kyla", "Marco", "Sofia", "Diego", "Trisha", "Andrei", "Bea", "Ramon", "Liza", "Paolo", "Camille", "Victor", "Grace", "Henry"];
  const lastNames = ["Doe", "Reyes", "Santos", "Cruz", "Garcia", "Dela Cruz", "Villanueva", "Aquino", "Navarro", "Mendoza", "Ramos", "Torres", "Flores", "Rivera", "Bautista", "Ocampo", "Salazar", "Pineda", "Domingo", "Lopez", "Castillo", "Mercado", "Velasco", "Santiago", "Dizon"];
  const phones = ["0917", "0918", "0927", "0908", "0999", "0916", "0939", "0956"];

  // Indices that should be INACTIVE among the first 25
  const INACTIVE_INDICES = new Set([3, 9, 14, 20]);

  const patientIds: string[] = [];
  for (let i = 0; i < 25; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[i % lastNames.length];
    // NOTE: patients are seeded WITHOUT an email address so no real-looking
    // addresses ever exist in the database and no emails can be sent to them.
    const patient = await prisma.patient.create({
      data: {
        firstName: fn,
        lastName: ln,
        email: null,
        phone: `${phones[i % phones.length]}${String(1000000 + i * 137).padStart(7, "0")}`,
        status: INACTIVE_INDICES.has(i) ? PatientStatus.INACTIVE : PatientStatus.ACTIVE,
        // A mix of follow-up preferences for demo purposes
        followUpEnabled: i % 9 !== 5,
        followUpDays: 1 + (i % 3),
      },
    });
    patientIds.push(patient.id);
  }

  // --- Extra patients with ZERO appointments (for demoing "No appointments" filter & empty state) ---
  const extraPatients = [
    { firstName: "Ria", lastName: "Bernal", phone: "09170000001" },
    { firstName: "Troy", lastName: "Lim", phone: "09180000002" },
    { firstName: "Celine", lastName: "Gutierrez", phone: "09270000003" },
    { firstName: "Derek", lastName: "Pascual", phone: "09080000004" },
  ];

  for (const ep of extraPatients) {
    const patient = await prisma.patient.create({
      data: {
        firstName: ep.firstName,
        lastName: ep.lastName,
        email: null,
        phone: ep.phone,
        status: PatientStatus.ACTIVE,
      },
    });
    patientIds.push(patient.id);
  }

  console.log(`Created ${patientIds.length} patients (25 with appointments, ${extraPatients.length} new with no appointments)`);

  // --- Appointments ---
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
  const allServices = await prisma.service.findMany();
  let aptCount = 0;
  let aptNo = 0;
  // Only assign appointments to the first 25 patients (indices 0-24)
  const appointmentPatientIds = patientIds.slice(0, 25);
  // Spread appointments from ~60 days ago to ~30 days ahead
  for (let offset = -60; offset <= 30; offset++) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);

    const dayKey = days[date.getDay()]; // 0=Sun...6=Sat
    if (dayKey === "SUN" || dayKey === "SAT") continue;

    const fullDay: Record<string, string> = { SUN: "SUNDAY", MON: "MONDAY", TUE: "TUESDAY", WED: "WEDNESDAY", THU: "THURSDAY", FRI: "FRIDAY", SAT: "SATURDAY" };
    const daySched = schedule[fullDay[dayKey]] ?? null;
    if (!daySched) continue;
    const slots = daySlots(daySched);

    // Randomize whether we generate 3-6 appointments that day
    const numToday = Math.floor(Math.random() * 4) + 2;
    for (let k = 0; k < numToday && k < slots.length; k++) {
      const dentistIdx = Math.floor(Math.random() * dentists.length);
      const dentistId = dentists[dentistIdx];
      const serviceIdx = Math.floor(Math.random() * allServices.length);
      const service = allServices[serviceIdx];
      const slot = slots[Math.abs((k * 3 + offset)) % slots.length];

      // Skip appointment if the service duration exceeds the remaining slot capacity
      const startMin = toMinutes(slot.start);
      const endMin = startMin + service.durationMin;
      const close = toMinutes(daySched.end);
      const breakStart = daySched.breakStart ? toMinutes(daySched.breakStart) : null;
      const breakEnd = daySched.breakEnd ? toMinutes(daySched.breakEnd) : null;
      if (endMin > close) continue;
      if (breakStart !== null && breakEnd !== null && startMin < breakEnd && endMin > breakStart) continue;

      const patientId = appointmentPatientIds[Math.floor(Math.random() * appointmentPatientIds.length)];
      // Status weighting: past -> mostly completed/cancelled/no-show; future -> pending/confirmed
      const isPast = offset < 0;
      const isToday = offset === 0;
      let status: AppointmentStatus;
      if (isPast) {
        status = [AppointmentStatus.COMPLETED, AppointmentStatus.COMPLETED, AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW][Math.floor(Math.random() * 5)];
      } else if (isToday) {
        status = [AppointmentStatus.CONFIRMED, AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING, AppointmentStatus.CHECKED_IN][Math.floor(Math.random() * 4)];
      } else {
        status = [AppointmentStatus.PENDING, AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED][Math.floor(Math.random() * 3)];
      }

      aptNo += 1;
      const year = date.getFullYear();
      aptCount += 1;
      await prisma.appointment.create({
        data: {
          referenceNumber: `APT-${year}-${String(aptNo).padStart(4, "0")}`,
          appointmentDate: date,
          startTime: slot.start,
          endTime: toHHMM(endMin),
          status,
          price: service.price,
          patientId,
          dentistId,
          serviceId: service.id,
          createdById: Math.random() > 0.5 ? adminUser.id : receptionistUser.id,
          notes: Math.random() > 0.85 ? "Patient reminded to arrive 10 minutes early." : null,
        },
      });
    }
  }
  console.log(`Created ${aptCount} appointments`);

  // --- Follow-ups (demo data for the dashboard panel) ---
  // Schedule follow-ups for the most recent completed appointments using each
  // patient's follow-up preference. Some are SENT / FAILED to show statuses.
  const completedAppts = await prisma.appointment.findMany({
    where: { status: "COMPLETED" },
    include: { patient: true },
    orderBy: { appointmentDate: "desc" },
    take: 12,
  });

  let followUpCount = 0;
  for (let i = 0; i < completedAppts.length; i++) {
    const a = completedAppts[i];
    if (!a.patient.email || !a.patient.followUpEnabled) continue;

    const scheduledFor = new Date(a.appointmentDate);
    scheduledFor.setUTCDate(scheduledFor.getUTCDate() + a.patient.followUpDays);
    scheduledFor.setUTCHours(9, 0, 0, 0);

    const data: {
      patientId: string;
      appointmentId: string;
      scheduledFor: Date;
      status: "SCHEDULED" | "SENT" | "FAILED";
      sentAt?: Date;
      error?: string;
    } = {
      patientId: a.patientId,
      appointmentId: a.id,
      scheduledFor,
      status: "SCHEDULED",
    };

    if (i % 4 === 2) {
      data.status = "SENT";
      data.sentAt = new Date(scheduledFor.getTime() - 60 * 60 * 1000);
    } else if (i % 7 === 3) {
      data.status = "FAILED";
      data.error = "Connection reset by remote server (demo).";
    }

    await prisma.followUp.create({ data });
    followUpCount++;
  }
  console.log(`Created ${followUpCount} follow-ups`);

  // --- Notifications (demo data for the bell + notification history) ---
  // Staff-facing only (Admin + Receptionist); created_at is spread over recent
  // days so the relative-timestamp UI has something to show.
  const demoAppts = await prisma.appointment.findMany({
    include: { patient: true, dentist: true, service: true },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  let notifCount = 0;
  if (demoAppts.length > 0) {
    const [a0, a1, a2, a3, a4, a5] = demoAppts;
    const pn = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

    const notificationDefs: {
      userId: string;
      type: NotificationType;
      title: string;
      message: string;
      entityType: string;
      entityId: string;
      createdAt: Date;
    }[] = [
      {
        userId: adminUser.id,
        type: NotificationType.APPOINTMENT_CREATED,
        title: "New appointment",
        message: `${pn(a0.patient)} booked ${a0.service.name} for ${fmtMonthDay(a0.appointmentDate)} at ${fmtClock(a0.startTime)}.`,
        entityType: "appointment",
        entityId: a0.id,
        createdAt: minutesAgo(12),
      },
      {
        userId: receptionistUser.id,
        type: NotificationType.APPOINTMENT_CREATED,
        title: "New appointment",
        message: `${pn(a0.patient)} booked ${a0.service.name} for ${fmtMonthDay(a0.appointmentDate)} at ${fmtClock(a0.startTime)}.`,
        entityType: "appointment",
        entityId: a0.id,
        createdAt: minutesAgo(12),
      },
      {
        userId: adminUser.id,
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: "Appointment confirmed",
        message: `${pn(a1.patient)}'s appointment has been confirmed for ${fmtMonthDay(a1.appointmentDate)} at ${fmtClock(a1.startTime)}.`,
        entityType: "appointment",
        entityId: a1.id,
        createdAt: hoursAgo(3),
      },
      {
        userId: receptionistUser.id,
        type: NotificationType.PATIENT_CHECKED_IN,
        title: "Patient checked in",
        message: `${pn(a2.patient)} has checked in for the ${fmtClock(a2.startTime)} appointment.`,
        entityType: "appointment",
        entityId: a2.id,
        createdAt: hoursAgo(5),
      },
      {
        userId: adminUser.id,
        type: NotificationType.APPOINTMENT_COMPLETED,
        title: "Appointment completed",
        message: `${pn(a3.patient)}'s appointment with ${a3.dentist.name} has been completed.`,
        entityType: "appointment",
        entityId: a3.id,
        createdAt: hoursAgo(8),
      },
      {
        userId: adminUser.id,
        type: NotificationType.APPOINTMENT_REMINDER,
        title: "Appointment reminder",
        message: `${pn(a4.patient)} has an appointment tomorrow at ${fmtClock(a4.startTime)}.`,
        entityType: "appointment",
        entityId: a4.id,
        createdAt: hoursAgo(26),
      },
      {
        userId: receptionistUser.id,
        type: NotificationType.APPOINTMENT_REMINDER,
        title: "Appointment reminder",
        message: `${pn(a4.patient)} has an appointment tomorrow at ${fmtClock(a4.startTime)}.`,
        entityType: "appointment",
        entityId: a4.id,
        createdAt: hoursAgo(26),
      },
      {
        userId: adminUser.id,
        type: NotificationType.APPOINTMENT_CANCELLED,
        title: "Appointment cancelled",
        message: `${pn(a5.patient)} cancelled the ${a5.service.name} appointment scheduled for ${fmtMonthDay(a5.appointmentDate)}.`,
        entityType: "appointment",
        entityId: a5.id,
        createdAt: hoursAgo(30),
      },
      {
        userId: adminUser.id,
        type: NotificationType.PATIENT_CREATED,
        title: "New patient",
        message: `${pn(a5.patient)} has been registered as a new patient.`,
        entityType: "patient",
        entityId: a5.patientId,
        createdAt: daysAgo(2),
      },
    ];

    // A few already-read rows so the read/unread distinction is visible.
    for (const def of notificationDefs) {
      await prisma.notification.create({ data: def });
      notifCount++;
    }
    for (const def of notificationDefs.slice(0, 3)) {
      await prisma.notification.updateMany({
        where: { userId: def.userId, entityId: def.entityId, type: def.type },
        data: { isRead: true, readAt: minutesAgo(5) },
      });
    }
  }
  console.log(`Created ${notifCount} notifications`);

  // --- Blocked dates (a couple of future dates) ---
  await prisma.blockedDate.createMany({
    data: [
      { date: addDays(20), reason: "Clinic staff training" },
      { date: addDays(35), reason: "Public holiday (planned)" },
    ],
  });

  console.log("Seeding complete.");
}

function addDays(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtMonthDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 1000);
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
