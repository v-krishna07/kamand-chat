/**
 * Realistic IIT Mandi Campus Fixtures for `DEMO_MODE=true` and Offline Fallback (§12).
 */

export interface MoodleCourseFixture {
  id: number;
  shortname: string;
  fullname: string;
  instructor: string;
  roomCode: string;
  gradePercent: number;
  modules: Array<{ id: number; name: string; type: 'resource' | 'forum' | 'assign' | 'quiz' }>;
}

export interface MoodleDeadlineFixture {
  id: string;
  courseCode: string;
  title: string;
  type: 'assignment' | 'quiz';
  dueAt: string;
}

export const DEMO_MOODLE_COURSES: MoodleCourseFixture[] = [
  {
    id: 101,
    shortname: 'IC-112',
    fullname: 'IC-112 · Calculus',
    instructor: 'School of Mathematical & Statistical Sciences',
    roomCode: 'A13-LH1',
    gradePercent: 88.5,
    modules: [
      { id: 1, name: 'Lecture Notes: Multivariable Integrals (PDF)', type: 'resource' },
      { id: 2, name: 'Tutorial Sheet 4 Submission', type: 'assign' },
      { id: 3, name: 'Quiz 2: Partial Derivatives', type: 'quiz' },
    ],
  },
  {
    id: 102,
    shortname: 'IC-152',
    fullname: 'IC-152 · Computing and Data Science',
    instructor: 'School of Computing & Electrical Engineering (SCEE)',
    roomCode: 'A17-LAB2',
    gradePercent: 94.0,
    modules: [
      { id: 4, name: 'Lab 6: Python Data Structures & NumPy', type: 'assign' },
      { id: 5, name: 'Course Discussion Forum', type: 'forum' },
    ],
  },
  {
    id: 103,
    shortname: 'IC-131',
    fullname: 'IC-131 · Applied Electronics for Engineers',
    instructor: 'SCEE Faculty',
    roomCode: 'A13-LH2',
    gradePercent: 85.0,
    modules: [
      { id: 6, name: 'Breadboard & Op-Amp Lab Manual', type: 'resource' },
      { id: 7, name: 'Mid-Sem Lab Report', type: 'assign' },
    ],
  },
  {
    id: 104,
    shortname: 'IC-140',
    fullname: 'IC-140 · Engineering Graphics for Design',
    instructor: 'School of Mechanical & Materials Engineering',
    roomCode: 'CAD-LAB',
    gradePercent: 91.0,
    modules: [{ id: 8, name: 'Orthographic Projections Sheet 3', type: 'assign' }],
  },
];

export function getDemoMoodleDeadlines(): MoodleDeadlineFixture[] {
  const now = Date.now();
  return [
    {
      id: 'dl-ic152-lab6',
      courseCode: 'IC-152',
      title: 'Lab 6: Python Data Structures & NumPy',
      type: 'assignment',
      dueAt: new Date(now + 18 * 3600_000).toISOString(), // 18 hours from now
    },
    {
      id: 'dl-ic112-quiz2',
      courseCode: 'IC-112',
      title: 'Quiz 2: Partial Derivatives & Gradient Vectors',
      type: 'quiz',
      dueAt: new Date(now + 42 * 3600_000).toISOString(), // 42 hours from now
    },
    {
      id: 'dl-ic131-report',
      courseCode: 'IC-131',
      title: 'Op-Amp Voltage Divider & Sensor Lab Report',
      type: 'assignment',
      dueAt: new Date(now + 90 * 3600_000).toISOString(),
    },
  ];
}

export const DEMO_WEATHER_MANDI = {
  location: 'Kamand Valley, IIT Mandi (Himachal Pradesh)',
  temperatureC: 19,
  condition: 'Clear Mountain Breeze',
  humidityPercent: 54,
  windKmh: 9,
  updatedAt: new Date().toISOString(),
};

/**
 * Infers IIT Mandi student batch, branch, and year from a standard roll number or institute email
 * (e.g. `b26343@students.iitmandi.ac.in` or `b23101`).
 */
export function inferRollNumberProfile(emailOrRoll: string): {
  rollNumber: string | null;
  batchYear: number | null;
  academicYearLabel: string | null;
  suggestedChannels: string[];
} {
  const match = emailOrRoll.toLowerCase().match(/\b(b(\d{2})\d{3})\b/);
  if (!match) {
    return {
      rollNumber: null,
      batchYear: null,
      academicYearLabel: null,
      suggestedChannels: ['general', 'kamand-prompt'],
    };
  }

  const rollNumber = match[1]!.toUpperCase();
  const twoDigitYear = parseInt(match[2]!, 10);
  const batchYear = 2000 + twoDigitYear;
  const currentYear = 2026;
  const yearNum = Math.max(1, Math.min(4, currentYear - batchYear + 1));
  const yearSuffix =
    yearNum === 1 ? '1st Year' : yearNum === 2 ? '2nd Year' : yearNum === 3 ? '3rd Year' : '4th Year';

  return {
    rollNumber,
    batchYear,
    academicYearLabel: `B.Tech ${yearSuffix} (Batch of ${batchYear + 4})`,
    suggestedChannels: ['general', 'kamand-prompt', 'b19-north-campus', 'ic-112-calculus'],
  };
}
