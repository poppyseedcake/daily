export type LocalPointSelectionRequest = {
  latitude: number;
  longitude: number;
};

const knownPoints = [
  { label: 'Warsaw Central Station, Warsaw, Poland', latitude: 52.2285, longitude: 21.0037 },
  { label: 'Palace of Culture and Science, Warsaw, Poland', latitude: 52.2318, longitude: 21.0067 },
  { label: 'Warsaw University Library, Warsaw, Poland', latitude: 52.241, longitude: 21.0255 }
];

export const selectLocalPoint = ({ latitude, longitude }: LocalPointSelectionRequest) =>
  knownPoints.find((point) => point.latitude === latitude && point.longitude === longitude) ?? {
    label: `Selected map point near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    latitude,
    longitude
  };
