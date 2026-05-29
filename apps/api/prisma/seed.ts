import * as bcrypt from 'bcrypt';
import {
  PrismaClient,
  Role,
  EventStatus,
  SafetyStatus,
  NotificationType,
  AuditAction,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.safetyReport.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  const passwordHash = await bcrypt.hash('Password123!', 10);

  const hq = await prisma.department.create({ data: { name: '總部' } });
  const rnd = await prisma.department.create({
    data: { name: '研發', parentId: hq.id },
  });
  const rndA = await prisma.department.create({
    data: { name: '研發A', parentId: rnd.id },
  });
  const rndB = await prisma.department.create({
    data: { name: '研發B', parentId: rnd.id },
  });
  const sales = await prisma.department.create({
    data: { name: '業務', parentId: hq.id },
  });
  const hr = await prisma.department.create({
    data: { name: '人資', parentId: hq.id },
  });
  const finance = await prisma.department.create({
    data: { name: '財務', parentId: hq.id },
  });
  const marketing = await prisma.department.create({
    data: { name: '行銷', parentId: hq.id },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@demo.com',
      passwordHash,
      name: '系統管理員',
      role: Role.ADMIN,
    },
  });

  const ceo = await prisma.user.create({
    data: {
      email: 'ceo@demo.com',
      passwordHash,
      name: '執行長',
      role: Role.MANAGER,
      departmentId: hq.id,
      managerId: null,
    },
  });

  const rndManager = await prisma.user.create({
    data: {
      email: 'manager@demo.com',
      passwordHash,
      name: '研發主管',
      role: Role.MANAGER,
      departmentId: rnd.id,
      managerId: ceo.id,
    },
  });

  const rndAManager = await prisma.user.create({
    data: {
      email: 'rnd-a.manager@demo.com',
      passwordHash,
      name: '研發A主管',
      role: Role.MANAGER,
      departmentId: rndA.id,
      managerId: rndManager.id,
    },
  });

  const rndBManager = await prisma.user.create({
    data: {
      email: 'rnd-b.manager@demo.com',
      passwordHash,
      name: '研發B主管',
      role: Role.MANAGER,
      departmentId: rndB.id,
      managerId: rndManager.id,
    },
  });

  const salesManager = await prisma.user.create({
    data: {
      email: 'sales.manager@demo.com',
      passwordHash,
      name: '業務主管',
      role: Role.MANAGER,
      departmentId: sales.id,
      managerId: ceo.id,
    },
  });

  const hrManager = await prisma.user.create({
    data: {
      email: 'hr.manager@demo.com',
      passwordHash,
      name: '人資主管',
      role: Role.MANAGER,
      departmentId: hr.id,
      managerId: ceo.id,
    },
  });

  const financeManager = await prisma.user.create({
    data: {
      email: 'finance.manager@demo.com',
      passwordHash,
      name: '財務主管',
      role: Role.MANAGER,
      departmentId: finance.id,
      managerId: ceo.id,
    },
  });

  const marketingManager = await prisma.user.create({
    data: {
      email: 'marketing.manager@demo.com',
      passwordHash,
      name: '行銷主管',
      role: Role.MANAGER,
      departmentId: marketing.id,
      managerId: ceo.id,
    },
  });

  const employee1 = await prisma.user.create({
    data: {
      email: 'employee1@demo.com',
      passwordHash,
      name: '研發A甲',
      role: Role.EMPLOYEE,
      departmentId: rndA.id,
      managerId: rndAManager.id,
    },
  });

  const employee2 = await prisma.user.create({
    data: {
      email: 'employee2@demo.com',
      passwordHash,
      name: '研發A乙',
      role: Role.EMPLOYEE,
      departmentId: rndA.id,
      managerId: rndAManager.id,
    },
  });

  const employee3 = await prisma.user.create({
    data: {
      email: 'employee3@demo.com',
      passwordHash,
      name: '業務甲',
      role: Role.EMPLOYEE,
      departmentId: sales.id,
      managerId: salesManager.id,
    },
  });

  await prisma.user.createMany({
    data: [
      {
        email: 'rnd-b.emp1@demo.com',
        passwordHash,
        name: '研發B甲',
        role: Role.EMPLOYEE,
        departmentId: rndB.id,
        managerId: rndBManager.id,
      },
      {
        email: 'rnd-b.emp2@demo.com',
        passwordHash,
        name: '研發B乙',
        role: Role.EMPLOYEE,
        departmentId: rndB.id,
        managerId: rndBManager.id,
      },
      {
        email: 'sales.emp2@demo.com',
        passwordHash,
        name: '業務乙',
        role: Role.EMPLOYEE,
        departmentId: sales.id,
        managerId: salesManager.id,
      },
      {
        email: 'hr.emp1@demo.com',
        passwordHash,
        name: '人資甲',
        role: Role.EMPLOYEE,
        departmentId: hr.id,
        managerId: hrManager.id,
      },
      {
        email: 'hr.emp2@demo.com',
        passwordHash,
        name: '人資乙',
        role: Role.EMPLOYEE,
        departmentId: hr.id,
        managerId: hrManager.id,
      },
      {
        email: 'finance.emp1@demo.com',
        passwordHash,
        name: '財務甲',
        role: Role.EMPLOYEE,
        departmentId: finance.id,
        managerId: financeManager.id,
      },
      {
        email: 'finance.emp2@demo.com',
        passwordHash,
        name: '財務乙',
        role: Role.EMPLOYEE,
        departmentId: finance.id,
        managerId: financeManager.id,
      },
      {
        email: 'marketing.emp1@demo.com',
        passwordHash,
        name: '行銷甲',
        role: Role.EMPLOYEE,
        departmentId: marketing.id,
        managerId: marketingManager.id,
      },
      {
        email: 'marketing.emp2@demo.com',
        passwordHash,
        name: '行銷乙',
        role: Role.EMPLOYEE,
        departmentId: marketing.id,
        managerId: marketingManager.id,
      },
    ],
  });

  const event = await prisma.event.create({
    data: {
      title: '地震演練 / 緊急事件',
      description: '請盡速回報自身安全狀態。',
      status: EventStatus.ACTIVE,
      createdById: admin.id,
    },
  });

  await prisma.safetyReport.create({
    data: {
      userId: employee1.id,
      eventId: event.id,
      status: SafetyStatus.SAFE,
      message: '人在辦公室，一切正常。',
    },
  });

  await prisma.safetyReport.create({
    data: {
      userId: employee2.id,
      eventId: event.id,
      status: SafetyStatus.NEED_HELP,
      message: '需要協助撤離。',
    },
  });

  await prisma.notification.create({
    data: {
      userId: employee3.id,
      type: NotificationType.REMINDER_EMPLOYEE,
      title: '尚未完成安全回報',
      body: `事件「${event.title}」尚未收到您的回報，請盡快回報。`,
      relatedEventId: event.id,
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: admin.id,
        action: AuditAction.CREATE,
        resource: 'Event',
        resourceId: event.id,
        payload: { title: event.title },
      },
      {
        actorId: admin.id,
        action: AuditAction.LOGIN,
        resource: 'Auth',
        payload: { email: admin.email },
      },
    ],
  });

  // eslint-disable-next-line no-console
  console.log('Seed completed.', {
    admin: admin.email,
    ceo: ceo.email,
    managers: [
      rndManager.email,
      rndAManager.email,
      rndBManager.email,
      salesManager.email,
      hrManager.email,
      financeManager.email,
      marketingManager.email,
    ],
    sampleEmployees: [employee1.email, employee2.email, employee3.email],
    eventId: event.id,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
