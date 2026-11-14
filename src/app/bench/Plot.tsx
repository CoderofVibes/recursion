import { useEffect, useRef } from 'react';
import { covEllipse } from '../../contracts/index.ts';
import type {
  Forecast,
  ForecastDraft,
  TrailPoint,
  Vec2,
  ViewSnapshot,
} from '../../contracts/index.ts';
import { yawOf } from '../../lib/quat.ts';

/**
 * Flight-plane plot for the integration bench: a plain 2D drawing of the `ViewSnapshot`, in
 * the believed frame, centred on the first believed body. It stands in for the 3D sensor view
 * (2E) and is removed when that lands. Colours come from the bench's CSS variables.
 */
export interface PlotProps {
  /** Called every animation frame; returns what to draw. */
  readonly frame: () => { view: ViewSnapshot; preview?: ForecastDraft };
  /** Half-width of the plotted area, m. */
  readonly span: number;
  readonly follow: boolean;
}

type Path = readonly { readonly position: Vec2 }[];

export function Plot({ frame, span, follow }: PlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const style = getComputedStyle(canvas);
    const colour = (name: string): string => style.getPropertyValue(name).trim();
    const ink = {
      fg: colour('--fg'),
      dim: colour('--dim'),
      accent: colour('--accent'),
      warn: colour('--warn'),
      line: colour('--line'),
      other: colour('--other'),
    };
    let raf = 0;

    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const { view, preview } = frame();
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (
        canvas.width !== Math.round(width * ratio) ||
        canvas.height !== Math.round(height * ratio)
      ) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const ship = view.world.ship;
      const origin = follow ? ship.position : (view.world.bodies[0]?.position ?? { x: 0, y: 0 });
      const scale = Math.min(width, height) / (2 * span);
      const sx = (p: Vec2): number => width / 2 + (p.x - origin.x) * scale;
      const sy = (p: Vec2): number => height / 2 - (p.y - origin.y) * scale;

      const path = (points: Path, stroke: string, dash: number[], lineWidth = 1): void => {
        if (points.length < 2) return;
        context.beginPath();
        points.forEach((p, i) =>
          i === 0
            ? context.moveTo(sx(p.position), sy(p.position))
            : context.lineTo(sx(p.position), sy(p.position)),
        );
        context.strokeStyle = stroke;
        context.lineWidth = lineWidth;
        context.setLineDash(dash);
        context.stroke();
        context.setLineDash([]);
      };
      const ring = (center: Vec2, radius: number, stroke: string, dash: number[]): void => {
        context.beginPath();
        context.arc(sx(center), sy(center), radius * scale, 0, 2 * Math.PI);
        context.strokeStyle = stroke;
        context.lineWidth = 1;
        context.setLineDash(dash);
        context.stroke();
        context.setLineDash([]);
      };
      const forecast = (f: Forecast | ForecastDraft, stroke: string): void => {
        path(f.samples, stroke, [2, 4]);
        // One-sigma envelope, every tenth sample.
        context.strokeStyle = stroke;
        context.globalAlpha = 0.35;
        f.samples.forEach((s, i) => {
          if (i % 10 !== 0) return;
          // LIFT(2G): the envelope is the covariance's x–y block.
          const e = covEllipse([s.positionCov[0], s.positionCov[1], s.positionCov[3]]);
          context.beginPath();
          context.ellipse(
            sx(s.position),
            sy(s.position),
            Math.max(e.major * scale, 0.5),
            Math.max(e.minor * scale, 0.5),
            -e.angle,
            0,
            2 * Math.PI,
          );
          context.stroke();
        });
        context.globalAlpha = 1;
      };

      // Objectives with a region: a dashed ring.
      for (const objective of view.objectives)
        if (objective.region)
          ring(objective.region.center, objective.region.radius, ink.accent, [6, 6]);

      // Sensor coverage.
      for (const sector of view.coverage.cones) {
        // LIFT(2G): a cone is drawn as its x–y sector about the axis's azimuth.
        const center = Math.atan2(sector.axis.y, sector.axis.x);
        context.beginPath();
        context.moveTo(sx(ship.position), sy(ship.position));
        context.arc(
          sx(ship.position),
          sy(ship.position),
          sector.range * scale,
          -(center + sector.halfAngle),
          -(center - sector.halfAngle),
        );
        context.closePath();
        context.fillStyle = ink.line;
        context.globalAlpha = 0.25 * sector.quality;
        context.fill();
        context.globalAlpha = 1;
      }

      // Bodies and asteroids where the ship believes they are.
      for (const body of view.world.bodies) {
        context.beginPath();
        context.arc(
          sx(body.position),
          sy(body.position),
          Math.max(body.radius * scale, 2),
          0,
          2 * Math.PI,
        );
        context.fillStyle = ink.line;
        context.fill();
        context.strokeStyle = body.tracked ? ink.fg : ink.dim;
        context.stroke();
        context.fillStyle = ink.dim;
        context.fillText(
          body.name.toUpperCase(),
          sx(body.position) + body.radius * scale + 6,
          sy(body.position),
        );
      }
      for (const asteroid of view.world.asteroids) {
        context.beginPath();
        context.arc(
          sx(asteroid.position),
          sy(asteroid.position),
          Math.max(asteroid.radius * scale, 1.5),
          0,
          2 * Math.PI,
        );
        context.fillStyle = asteroid.tracked ? ink.fg : ink.dim;
        context.fill();
      }

      // Compare overlay, then this attempt: forecasts dotted, measured trail solid (P10).
      if (view.compare)
        view.compare.forEach((overlay, i) => {
          const stroke = i === 0 ? ink.other : ink.warn;
          path(overlay.trail as readonly TrailPoint[], stroke, [], 1);
          if (overlay.forecast) forecast(overlay.forecast, stroke);
        });
      for (const f of view.forecasts) forecast(f, ink.accent);
      if (preview) forecast(preview, ink.fg);
      path(view.trail, ink.fg, [], 1.5);

      // The ship: body axis tick, velocity tick, thrust tick.
      const x = sx(ship.position);
      const y = sy(ship.position);
      // LIFT(2G): the body axis is drawn at the attitude's yaw.
      const yaw = yawOf(ship.attitude);
      context.beginPath();
      context.arc(x, y, 3, 0, 2 * Math.PI);
      context.fillStyle = ink.fg;
      context.fill();
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 14 * Math.cos(yaw), y - 14 * Math.sin(yaw));
      context.strokeStyle = ink.fg;
      context.lineWidth = 2;
      context.stroke();
      const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
      if (speed > 0) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + (22 * ship.velocity.x) / speed, y - (22 * ship.velocity.y) / speed);
        context.strokeStyle = ink.dim;
        context.lineWidth = 1;
        context.stroke();
      }
      if (view.ship.thrust.length > 0) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - 18 * Math.cos(yaw), y + 18 * Math.sin(yaw));
        context.strokeStyle = ink.warn;
        context.lineWidth = 3;
        context.stroke();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [frame, span, follow]);

  return <canvas ref={canvasRef} className="bench-plot" />;
}
