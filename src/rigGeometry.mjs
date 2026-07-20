export function getRigPartTransform({ part, targetFrom, targetTo, sourceTo = null }) {
  const sourceFrom = part.proximal_anchor.xy;
  const resolvedSourceTo = sourceTo ?? part.distal_anchor.xy;
  const sourceDx = resolvedSourceTo[0] - sourceFrom[0];
  const sourceDy = resolvedSourceTo[1] - sourceFrom[1];
  const targetDx = targetTo.x - targetFrom.x;
  const targetDy = targetTo.y - targetFrom.y;
  const sourceLength = Math.hypot(sourceDx, sourceDy);
  const targetLength = Math.hypot(targetDx, targetDy);
  if (sourceLength < 1 || targetLength < 0.01) return null;

  return {
    sourceFrom,
    rotation: Math.atan2(targetDy, targetDx) - Math.atan2(sourceDy, sourceDx),
    scale: targetLength / sourceLength,
    targetFrom,
  };
}

export function mapRigPartPoint({ part, targetFrom, targetTo, sourcePoint, sourceTo = null }) {
  const transform = getRigPartTransform({ part, targetFrom, targetTo, sourceTo });
  if (!transform) return null;
  const dx = sourcePoint[0] - transform.sourceFrom[0];
  const dy = sourcePoint[1] - transform.sourceFrom[1];
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  return {
    x: transform.targetFrom.x + (dx * cos - dy * sin) * transform.scale,
    y: transform.targetFrom.y + (dx * sin + dy * cos) * transform.scale,
  };
}
