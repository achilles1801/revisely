// Whether a recitation check is listening right now, anywhere in the app. Verse
// playback refuses to start then: the recitation would be heard as the reciter.

let listening = false;

export const isCheckListening = () => listening;
export const setCheckListening = (on: boolean) => {
  listening = on;
};
