import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { DATA_DIR } from './protocol/paths.js';

const NOTIFICATIONS_DIR = join(DATA_DIR, 'notifications');
const NOTIFICATIONS_PATH = join(NOTIFICATIONS_DIR, 'notifications.json');
const MAX_NOTIFICATIONS = 200;

const events = new EventEmitter();
events.setMaxListeners(50);

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, path);
}

function normalizeStore(parsed) {
  const notifications = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray(parsed.notifications)
      ? parsed.notifications
      : [];
  return {
    version: 1,
    notifications: notifications
      .filter((item) => item && typeof item === 'object')
      .slice(0, MAX_NOTIFICATIONS),
  };
}

async function loadStore() {
  await mkdir(NOTIFICATIONS_DIR, { recursive: true });
  if (!existsSync(NOTIFICATIONS_PATH)) {
    return { version: 1, notifications: [] };
  }
  try {
    return normalizeStore(JSON.parse(await readFile(NOTIFICATIONS_PATH, 'utf8')));
  } catch {
    return { version: 1, notifications: [] };
  }
}

async function saveStore(store) {
  await mkdir(NOTIFICATIONS_DIR, { recursive: true });
  const normalized = normalizeStore(store);
  await atomicWriteJson(NOTIFICATIONS_PATH, normalized);
  events.emit('changed', publicState(normalized));
  return normalized;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function normalizeNotification(item) {
  const title = cleanText(item.title, 'Notification').slice(0, 120);
  const subject = cleanText(item.subject, title).slice(0, 160);
  return {
    ...item,
    level: ['info', 'success', 'warning', 'error'].includes(item.level) ? item.level : 'info',
    title,
    subject,
    body: cleanText(item.body || item.message, '').slice(0, 2000),
    source: cleanText(item.source, 'bor').slice(0, 80),
    readAtMs: item.readAtMs != null && Number.isFinite(Number(item.readAtMs)) ? Number(item.readAtMs) : null,
  };
}

function publicState(store) {
  const notifications = (store.notifications || []).map(normalizeNotification).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  const unread = notifications.filter((item) => !item.readAtMs).length;
  return { notifications, unread };
}

export function onNotificationsChanged(listener) {
  events.on('changed', listener);
  return () => events.off('changed', listener);
}

export async function listNotifications() {
  return publicState(await loadStore());
}

export async function addNotification(input = {}) {
  const store = await loadStore();
  const now = Date.now();
  const notification = {
    id: input.id && typeof input.id === 'string' ? input.id : `notif-${now}-${randomUUID().slice(0, 8)}`,
    createdAtMs: now,
    level: ['info', 'success', 'warning', 'error'].includes(input.level) ? input.level : 'info',
    subject: cleanText(input.subject, input.title || 'Notification').slice(0, 160),
    title: cleanText(input.title, 'Notification').slice(0, 120),
    body: cleanText(input.body || input.message, '').slice(0, 2000),
    source: cleanText(input.source, 'bor').slice(0, 80),
    jobId: input.jobId ? String(input.jobId).slice(0, 120) : undefined,
    surfaceId: input.surfaceId ? String(input.surfaceId).slice(0, 120) : undefined,
    runId: input.runId ? String(input.runId).slice(0, 160) : undefined,
    readAtMs: null,
  };
  store.notifications = [notification, ...store.notifications.filter((item) => item.id !== notification.id)].slice(0, MAX_NOTIFICATIONS);
  await saveStore(store);
  return notification;
}

export async function markNotificationRead(id) {
  const store = await loadStore();
  const now = Date.now();
  let changed = false;
  for (const item of store.notifications) {
    if (item.id === id && !item.readAtMs) {
      item.readAtMs = now;
      changed = true;
    }
  }
  if (changed) await saveStore(store);
  return publicState(store);
}

export async function markAllNotificationsRead() {
  const store = await loadStore();
  const now = Date.now();
  let changed = false;
  for (const item of store.notifications) {
    if (!item.readAtMs) {
      item.readAtMs = now;
      changed = true;
    }
  }
  if (changed) await saveStore(store);
  return publicState(store);
}

export async function removeNotification(id) {
  const store = await loadStore();
  const before = store.notifications.length;
  store.notifications = store.notifications.filter((item) => item.id !== id);
  if (store.notifications.length !== before) await saveStore(store);
  return publicState(store);
}

export async function clearNotifications() {
  const store = { version: 1, notifications: [] };
  await saveStore(store);
  return publicState(store);
}
