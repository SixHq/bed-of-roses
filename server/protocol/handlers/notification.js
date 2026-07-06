function clean(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

export async function executePushNotification(block, ctx) {
  if (typeof ctx.addNotification !== 'function') {
    throw new Error('notification store is not available');
  }
  const title = clean(block.attrs?.title, 'Notification');
  const subject = clean(block.attrs?.subject, title);
  const body = clean(block.body, '');
  const level = clean(block.attrs?.level || block.attrs?.kind, 'info').toLowerCase();
  const notification = await ctx.addNotification({
    subject,
    title,
    body,
    level,
    source: clean(block.attrs?.source, 'agent'),
    jobId: block.attrs?.jobid || block.attrs?.jobId,
    surfaceId: block.attrs?.surfaceid || block.attrs?.surfaceId,
  });
  return {
    ok: true,
    event: 'push_notification',
    payload: { notification },
    llmEcho: `notification pushed: ${notification.title}${notification.body ? ` — ${notification.body}` : ''}`,
  };
}
