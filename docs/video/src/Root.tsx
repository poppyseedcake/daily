import { Composition } from 'remotion';
import { DailyDemo } from './Composition';
import walkthrough from './walkthrough.json';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition id="DailyDemo" component={DailyDemo} durationInFrames={walkthrough.durationInFrames}
      fps={walkthrough.fps} width={1280} height={880} />
  );
};
