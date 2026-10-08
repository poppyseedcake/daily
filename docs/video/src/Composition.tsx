import { Video } from '@remotion/media';
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import walkthrough from './walkthrough.json';

export const DailyDemo = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const chapter = [...walkthrough.chapters].reverse().find(item => item.from <= frame);
  return <AbsoluteFill style={{ backgroundColor: '#172d52', fontFamily: 'Arial, sans-serif' }}>
    <Video src={staticFile('daily-walkthrough.webm')} trimBefore={walkthrough.trimBeforeFrames}
      durationInFrames={walkthrough.durationInFrames} premountFor={fps} muted
      style={{ width: 1280, height: 800 }} />
    <div style={{ position: 'absolute', top: 800, height: 80, left: 0, right: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', color: 'white' }}>
      <span style={{ fontSize: 26 }}>{chapter?.title}</span>
      <span style={{ fontSize: 18, color: '#cdd8e7' }}>Demo data</span>
    </div>
  </AbsoluteFill>;
};
