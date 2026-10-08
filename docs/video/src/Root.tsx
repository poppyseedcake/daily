import { Composition, Folder } from 'remotion';
import { DailyDemo } from './Composition';
import { Workspace } from './Workspace';
import { AddTask } from './AddTask';
import { Delivery } from './Delivery';
import { Summary } from './Summary';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="DailyDemo" component={DailyDemo} durationInFrames={720} fps={30} width={1920} height={1080} />
      <Folder name="Scenes">
        <Composition id="Workspace" component={Workspace} durationInFrames={180} fps={30} width={1920} height={1080} />
        <Composition id="AddTask" component={AddTask} durationInFrames={180} fps={30} width={1920} height={1080} />
        <Composition id="Delivery" component={Delivery} durationInFrames={180} fps={30} width={1920} height={1080} />
        <Composition id="Summary" component={Summary} durationInFrames={180} fps={30} width={1920} height={1080} />
      </Folder>
    </>
  );
};
