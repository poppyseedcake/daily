import { AbsoluteFill, CanvasImage, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

type SceneProps = { title: string; text: string; image: string; detail: string; zoom?: boolean };

export const Scene = ({ title, text, image, detail, zoom = false }: SceneProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: '#f7f8f5', color: '#172d52', fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <div style={{ position: 'absolute', left: 100, top: 96, fontSize: 38, fontWeight: 700 }}>Daily</div>
      <div style={{ position: 'absolute', left: 100, top: 265, width: 520,
        opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], { extrapolateRight: 'clamp' }),
        translate: interpolate(frame, [0, 0.6 * fps], ['0px 18px', '0px 0px'], { extrapolateRight: 'clamp', easing: Easing.bezier(0.22, 1, 0.36, 1) }) }}>
        <h1 style={{ margin: 0, fontSize: 82, lineHeight: 1.04, letterSpacing: '-0.03em', fontWeight: 650 }}>{title}</h1>
        <p style={{ marginTop: 32, color: '#4f594f', fontSize: 34, lineHeight: 1.45 }}>{text}</p>
      </div>
      <div style={{ position: 'absolute', left: 704, top: 160, width: 1116, height: 775, overflow: 'hidden',
        borderRadius: 12, boxShadow: '0 16px 50px rgba(23,45,82,0.12)' }}>
        <CanvasImage src={staticFile(image)} premountFor={fps} style={{ width: '100%', height: '100%', objectFit: 'cover',
          scale: zoom ? 1.6 : interpolate(frame, [0, 6 * fps], [1, 1.025], { extrapolateRight: 'clamp' }) }} />
      </div>
      <p style={{ position: 'absolute', left: 100, bottom: 82, margin: 0, color: '#4f594f', fontSize: 26 }}>{detail}</p>
      <p style={{ position: 'absolute', right: 100, bottom: 82, margin: 0, color: '#4f594f', fontSize: 22 }}>Fictional data · Visitor preview</p>
    </AbsoluteFill>
  );
};
