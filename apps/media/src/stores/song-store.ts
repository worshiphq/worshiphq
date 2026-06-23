import { create } from "zustand";
import type { Song, SongSection } from "../types";

interface SongState {
  songs: Song[];
  activeSong: Song | null;
  searchQuery: string;
  filteredSongs: Song[];

  loadSongs: () => void;
  setActiveSong: (song: Song | null) => void;
  search: (query: string) => void;
  addSong: (song: Song) => void;
  updateSong: (id: string, updates: Partial<Song>) => void;
  deleteSong: (id: string) => void;
  addSection: (songId: string, section: SongSection) => void;
  updateSection: (songId: string, sectionId: string, updates: Partial<SongSection>) => void;
  deleteSection: (songId: string, sectionId: string) => void;
  reorderSections: (songId: string, order: string[]) => void;
}

const DEMO_SONGS: Song[] = [
  {
    id: "1",
    title: "How Great Is Our God",
    author: "Chris Tomlin",
    key: "C",
    tags: ["worship", "praise"],
    order: ["v1", "c1", "v2", "c1", "b1", "c1"],
    sections: [
      { id: "v1", label: "Verse 1", order: 0, lyrics: "The splendor of the King\nClothed in majesty\nLet all the earth rejoice\nAll the earth rejoice\n\nHe wraps Himself in light\nAnd darkness tries to hide\nAnd trembles at His voice\nAnd trembles at His voice" },
      { id: "c1", label: "Chorus", order: 1, lyrics: "How great is our God\nSing with me\nHow great is our God\nAnd all will see how great\nHow great is our God" },
      { id: "v2", label: "Verse 2", order: 2, lyrics: "And age to age He stands\nAnd time is in His hands\nBeginning and the End\nBeginning and the End\n\nThe Godhead three in one\nFather Spirit Son\nThe Lion and the Lamb\nThe Lion and the Lamb" },
      { id: "b1", label: "Bridge", order: 3, lyrics: "Name above all names\nWorthy of all praise\nMy heart will sing\nHow great is our God" },
    ],
  },
  {
    id: "2",
    title: "Amazing Grace",
    author: "John Newton",
    key: "G",
    tags: ["hymn", "classic"],
    order: ["v1", "v2", "v3", "v4"],
    sections: [
      { id: "v1", label: "Verse 1", order: 0, lyrics: "Amazing grace how sweet the sound\nThat saved a wretch like me\nI once was lost but now am found\nWas blind but now I see" },
      { id: "v2", label: "Verse 2", order: 1, lyrics: "'Twas grace that taught my heart to fear\nAnd grace my fears relieved\nHow precious did that grace appear\nThe hour I first believed" },
      { id: "v3", label: "Verse 3", order: 2, lyrics: "Through many dangers toils and snares\nI have already come\n'Tis grace hath brought me safe thus far\nAnd grace will lead me home" },
      { id: "v4", label: "Verse 4", order: 3, lyrics: "When we've been there ten thousand years\nBright shining as the sun\nWe've no less days to sing God's praise\nThan when we'd first begun" },
    ],
  },
  {
    id: "3",
    title: "10,000 Reasons (Bless the Lord)",
    author: "Matt Redman",
    key: "G",
    tags: ["worship", "praise"],
    order: ["c1", "v1", "c1", "v2", "c1", "v3", "c1"],
    sections: [
      { id: "c1", label: "Chorus", order: 0, lyrics: "Bless the Lord O my soul\nO my soul\nWorship His holy name\nSing like never before\nO my soul\nI'll worship Your holy name" },
      { id: "v1", label: "Verse 1", order: 1, lyrics: "The sun comes up it's a new day dawning\nIt's time to sing Your song again\nWhatever may pass and whatever lies before me\nLet me be singing when the evening comes" },
      { id: "v2", label: "Verse 2", order: 2, lyrics: "You're rich in love and You're slow to anger\nYour name is great and Your heart is kind\nFor all Your goodness I will keep on singing\nTen thousand reasons for my heart to find" },
      { id: "v3", label: "Verse 3", order: 3, lyrics: "And on that day when my strength is failing\nThe end draws near and my time has come\nStill my soul will sing Your praise unending\nTen thousand years and then forevermore" },
    ],
  },
  {
    id: "4",
    title: "What A Beautiful Name",
    author: "Hillsong Worship",
    key: "D",
    tags: ["worship", "modern"],
    order: ["v1", "c1", "v2", "c2", "b1"],
    sections: [
      { id: "v1", label: "Verse 1", order: 0, lyrics: "You were the Word at the beginning\nOne with God the Lord Most High\nYour hidden glory in creation\nNow revealed in You our Christ" },
      { id: "c1", label: "Chorus 1", order: 1, lyrics: "What a beautiful Name it is\nWhat a beautiful Name it is\nThe Name of Jesus Christ my King\nWhat a beautiful Name it is\nNothing compares to this\nWhat a beautiful Name it is\nThe Name of Jesus" },
      { id: "v2", label: "Verse 2", order: 2, lyrics: "You didn't want heaven without us\nSo Jesus You brought heaven down\nMy sin was great Your love was greater\nWhat could separate us now" },
      { id: "c2", label: "Chorus 2", order: 3, lyrics: "What a wonderful Name it is\nWhat a wonderful Name it is\nThe Name of Jesus Christ my King\nWhat a wonderful Name it is\nNothing compares to this\nWhat a wonderful Name it is\nThe Name of Jesus" },
      { id: "b1", label: "Bridge", order: 4, lyrics: "Death could not hold You\nThe veil tore before You\nYou silence the boast of sin and grave\nThe heavens are roaring\nThe praise of Your glory\nFor You are raised to life again" },
    ],
  },
  {
    id: "5",
    title: "Goodness of God",
    author: "Bethel Music",
    key: "A",
    tags: ["worship", "modern"],
    order: ["v1", "c1", "v2", "c1", "b1", "c1"],
    sections: [
      { id: "v1", label: "Verse 1", order: 0, lyrics: "I love You Lord\nOh Your mercy never fails me\nAll my days I've been held in Your hands\nFrom the moment that I wake up\nUntil I lay my head\nI will sing of the goodness of God" },
      { id: "c1", label: "Chorus", order: 1, lyrics: "All my life You have been faithful\nAll my life You have been so so good\nWith every breath that I am able\nI will sing of the goodness of God" },
      { id: "v2", label: "Verse 2", order: 2, lyrics: "I love Your voice\nYou have led me through the fire\nIn darkest night You are close like no other\nI've known You as a father\nI've known You as a friend\nI have lived in the goodness of God" },
      { id: "b1", label: "Bridge", order: 3, lyrics: "Your goodness is running after\nIt's running after me\nYour goodness is running after\nIt's running after me\nWith my life laid down\nI'm surrendered now\nI give You everything\nYour goodness is running after\nIt's running after me" },
    ],
  },
  {
    id: "6",
    title: "Great Are You Lord",
    author: "All Sons & Daughters",
    key: "G",
    tags: ["worship"],
    order: ["v1", "c1", "v1", "c1", "b1", "c1"],
    sections: [
      { id: "v1", label: "Verse", order: 0, lyrics: "You give life You are love\nYou bring light to the darkness\nYou give hope You restore\nEvery heart that is broken\nGreat are You Lord" },
      { id: "c1", label: "Chorus", order: 1, lyrics: "It's Your breath in our lungs\nSo we pour out our praise\nWe pour out our praise\nIt's Your breath in our lungs\nSo we pour out our praise to You only" },
      { id: "b1", label: "Bridge", order: 2, lyrics: "All the earth will shout Your praise\nOur hearts will cry these bones will sing\nGreat are You Lord" },
    ],
  },
  {
    id: "7",
    title: "Way Maker",
    author: "Sinach",
    key: "E",
    tags: ["worship", "african"],
    order: ["v1", "c1", "v2", "c1", "b1"],
    sections: [
      { id: "v1", label: "Verse 1", order: 0, lyrics: "You are here moving in our midst\nI worship You I worship You\nYou are here working in this place\nI worship You I worship You" },
      { id: "c1", label: "Chorus", order: 1, lyrics: "Way maker miracle worker\nPromise keeper light in the darkness\nMy God that is who You are\nWay maker miracle worker\nPromise keeper light in the darkness\nMy God that is who You are" },
      { id: "v2", label: "Verse 2", order: 2, lyrics: "You are here touching every heart\nI worship You I worship You\nYou are here healing every heart\nI worship You I worship You" },
      { id: "b1", label: "Bridge", order: 3, lyrics: "Even when I don't see it You're working\nEven when I don't feel it You're working\nYou never stop You never stop working\nYou never stop You never stop working" },
    ],
  },
  {
    id: "8",
    title: "Blessed Assurance",
    author: "Fanny Crosby",
    key: "D",
    tags: ["hymn", "classic"],
    order: ["v1", "c1", "v2", "c1", "v3", "c1"],
    sections: [
      { id: "v1", label: "Verse 1", order: 0, lyrics: "Blessed assurance Jesus is mine\nOh what a foretaste of glory divine\nHeir of salvation purchase of God\nBorn of His Spirit washed in His blood" },
      { id: "c1", label: "Chorus", order: 1, lyrics: "This is my story this is my song\nPraising my Savior all the day long\nThis is my story this is my song\nPraising my Savior all the day long" },
      { id: "v2", label: "Verse 2", order: 2, lyrics: "Perfect submission perfect delight\nVisions of rapture now burst on my sight\nAngels descending bring from above\nEchoes of mercy whispers of love" },
      { id: "v3", label: "Verse 3", order: 3, lyrics: "Perfect submission all is at rest\nI in my Savior am happy and blessed\nWatching and waiting looking above\nFilled with His goodness lost in His love" },
    ],
  },
];

export const useSongStore = create<SongState>((set, get) => ({
  songs: [],
  activeSong: null,
  searchQuery: "",
  filteredSongs: [],

  loadSongs: () => {
    set({ songs: DEMO_SONGS, filteredSongs: DEMO_SONGS });
  },

  setActiveSong: (song) => set({ activeSong: song }),

  search: (query) => {
    set({ searchQuery: query });
    const q = query.toLowerCase();
    if (!q) {
      set({ filteredSongs: get().songs });
      return;
    }
    set({
      filteredSongs: get().songs.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.author?.toLowerCase().includes(q) ?? false) ||
          s.tags.some((t) => t.includes(q)) ||
          s.sections.some((sec) => sec.lyrics.toLowerCase().includes(q)),
      ),
    });
  },

  addSong: (song) =>
    set((state) => {
      const songs = [...state.songs, song];
      return { songs, filteredSongs: songs };
    }),

  updateSong: (id, updates) =>
    set((state) => {
      const songs = state.songs.map((s) => (s.id === id ? { ...s, ...updates } : s));
      return { songs, filteredSongs: songs, activeSong: state.activeSong?.id === id ? { ...state.activeSong, ...updates } : state.activeSong };
    }),

  deleteSong: (id) =>
    set((state) => {
      const songs = state.songs.filter((s) => s.id !== id);
      return { songs, filteredSongs: songs, activeSong: state.activeSong?.id === id ? null : state.activeSong };
    }),

  addSection: (songId, section) =>
    set((state) => {
      const songs = state.songs.map((s) =>
        s.id === songId ? { ...s, sections: [...s.sections, section] } : s,
      );
      const activeSong = state.activeSong?.id === songId
        ? { ...state.activeSong, sections: [...state.activeSong.sections, section] }
        : state.activeSong;
      return { songs, filteredSongs: songs, activeSong };
    }),

  updateSection: (songId, sectionId, updates) =>
    set((state) => {
      const songs = state.songs.map((s) =>
        s.id === songId
          ? { ...s, sections: s.sections.map((sec) => (sec.id === sectionId ? { ...sec, ...updates } : sec)) }
          : s,
      );
      const activeSong = state.activeSong?.id === songId
        ? { ...state.activeSong, sections: state.activeSong.sections.map((sec) => (sec.id === sectionId ? { ...sec, ...updates } : sec)) }
        : state.activeSong;
      return { songs, filteredSongs: songs, activeSong };
    }),

  deleteSection: (songId, sectionId) =>
    set((state) => {
      const songs = state.songs.map((s) =>
        s.id === songId
          ? { ...s, sections: s.sections.filter((sec) => sec.id !== sectionId) }
          : s,
      );
      const activeSong = state.activeSong?.id === songId
        ? { ...state.activeSong, sections: state.activeSong.sections.filter((sec) => sec.id !== sectionId) }
        : state.activeSong;
      return { songs, filteredSongs: songs, activeSong };
    }),

  reorderSections: (songId, order) =>
    set((state) => {
      const songs = state.songs.map((s) =>
        s.id === songId ? { ...s, order } : s,
      );
      const activeSong = state.activeSong?.id === songId
        ? { ...state.activeSong, order }
        : state.activeSong;
      return { songs, filteredSongs: songs, activeSong };
    }),
}));
