import { Series, useVideoConfig } from 'remotion';
import { Workspace } from './Workspace';
import { AddTask } from './AddTask';
import { Delivery } from './Delivery';
import { Summary } from './Summary';

export const DailyDemo = () => {
  const { fps } = useVideoConfig();
  return <Series>
    <Series.Sequence name="Task workspace" durationInFrames={6 * fps} premountFor={fps}><Workspace /></Series.Sequence>
    <Series.Sequence name="Add a task" durationInFrames={6 * fps} premountFor={fps}><AddTask /></Series.Sequence>
    <Series.Sequence name="Delivery time" durationInFrames={6 * fps} premountFor={fps}><Delivery /></Series.Sequence>
    <Series.Sequence name="Daily Summary" durationInFrames={6 * fps} premountFor={fps}><Summary /></Series.Sequence>
  </Series>;
};
