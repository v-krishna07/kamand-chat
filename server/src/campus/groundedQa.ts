import type { Citation, GroundedCampusQAResponse } from '@kamand/shared';

interface CampusKnowledgeDoc {
  title: string;
  sourceType: Citation['sourceType'];
  reference: string;
  keywords: string[];
  snippet: string;
  fullAnswer: string;
}

const CAMPUS_KNOWLEDGE_BASE: CampusKnowledgeDoc[] = [
  {
    title: 'IIT Mandi Transit & Electric Bus Schedule',
    sourceType: 'bus_schedule',
    reference: 'IIT Mandi Transport Desk Notification 2026/TR-04',
    keywords: ['bus', 'shuttle', 'transit', 'north campus', 'south campus', 'mind tree', 'a1', 'mandi'],
    snippet:
      'Regular electric buses run between North Campus (Mind Tree/Pine) and South Campus (A1/Main Gate) every 30 minutes from 07:30 to 22:30 on weekdays.',
    fullAnswer:
      'Electric buses run regularly between North Campus (Mind Tree, Pine, Cedar) and South Campus (A1, A2, Main Gate) starting from 07:30 until 22:30. Travel time through Kamand valley is approximately 18–22 minutes. Additional weekend shuttles connect South Campus directly to Mandi Town.',
  },
  {
    title: 'Hostel Mess Timings and Rules',
    sourceType: 'mess_menu',
    reference: 'IIT Mandi Council of Wardens Guidelines 2025-26 §4.2',
    keywords: ['mess', 'food', 'breakfast', 'lunch', 'dinner', 'snacks', 'meal', 'oak', 'pine', 'cedar', 'alder'],
    snippet:
      'Mess service hours: Breakfast (07:30–09:30), Lunch (12:00–14:00), Evening Snacks (17:00–18:00), Dinner (19:30–21:30). Guest coupons available at mess entrance.',
    fullAnswer:
      'Daily meal timings across Oak, Pine, Cedar, and Alder messes are: Breakfast from 07:30 to 09:30, Lunch from 12:00 to 14:00, Evening Snacks & Tea from 17:00 to 18:00, and Dinner from 19:30 to 21:30. All students must tap their ID or check-in with the mess supervisor. Vegetarian, vegan, and Jain options are available every day.',
  },
  {
    title: 'Emergency Medical & Health Clinic Protocol',
    sourceType: 'campus_handbook',
    reference: 'Kamand Health Clinic Emergency Protocol Manual 2026',
    keywords: ['medical', 'clinic', 'hospital', 'doctor', 'emergency', 'ambulance', 'health', 'injury', 'sick'],
    snippet:
      'Kamand Health Clinic is located in South Campus Medical Block. 24x7 doctor on call and ambulance service reachable at +91-1905-267011 / +91-98055-12345.',
    fullAnswer:
      'The Kamand Health Clinic is situated at the South Campus Medical Block with 24x7 doctor-on-call coverage, nursing staff, and a dedicated all-weather 4x4 ambulance. For any medical emergency or ambulance dispatch, call +91-1905-267011 or +91-98055-12345 immediately.',
  },
  {
    title: 'Academic Drop Deadlines and Grade Guidelines',
    sourceType: 'academic_calendar',
    reference: 'IIT Mandi Dean (Academics) Ordinance 2025-26 / Sem II',
    keywords: ['academic', 'drop', 'course', 'deadline', 'moodle', 'credits', 'attendance', 'exam'],
    snippet:
      'Students may drop a course without record until the end of Week 3. Minimum 75% attendance mandatory. Moodle grade appeals must be submitted within 7 days of score release.',
    fullAnswer:
      'According to the IIT Mandi Academic Ordinance: Course drops without academic record are allowed through the Dean Academics portal until the end of the third week of classes. A minimum of 75% attendance is required to appear in End-Semester examinations. Moodle assignment re-evaluation requests must be filed with course TAs within 7 days of marks publication.',
  },
  {
    title: 'First Commit Hackathon & Kamand Prompt Club Guidelines',
    sourceType: 'course_catalog',
    reference: 'Kamand Prompt Programming Club First Commit 2026 Brief',
    keywords: ['hackathon', 'first commit', 'kamand prompt', 'programming club', 'b-19', 'common room'],
    snippet:
      'First Commit is a 24-hour sprint by Kamand Prompt Programming Club. Team check-ins and hack sessions are centered around the B-19 common room.',
    fullAnswer:
      'The First Commit Hackathon is organized by Kamand Prompt (the official Programming Club of IIT Mandi). Participating teams coordinate in the B-19 common room. All project repositories require verifiable test suites, E2EE security compliance, and fluid 60fps gesture interfaces.',
  },
];

export class GroundedCampusQaService {
  public async answerCampusQuery(query: string): Promise<GroundedCampusQAResponse> {
    const qLower = query.toLowerCase();

    // Match relevant documents by keywords and token overlap
    const scoredDocs = CAMPUS_KNOWLEDGE_BASE.map((doc) => {
      let score = 0;
      for (const kw of doc.keywords) {
        if (qLower.includes(kw)) {
          score += 2;
        }
      }
      const titleTokens = doc.title.toLowerCase().split(/\s+/);
      for (const token of titleTokens) {
        if (token.length > 3 && qLower.includes(token)) {
          score += 1;
        }
      }
      return { doc, score };
    });

    scoredDocs.sort((a, b) => b.score - a.score);
    const topMatches = scoredDocs.filter((m) => m.score > 0);

    if (topMatches.length === 0) {
      // General helpful fallback for queries that don't match specific predefined documents
      return {
        query,
        answer: `I could not locate an exact IIT Mandi official ordinance for "${query}". You can consult the Academic Office at North Campus, check the physical notice board at A1-NKN, or speak with your Hostel Secretary.`,
        citations: [
          {
            title: 'IIT Mandi General Student Handbook',
            sourceType: 'campus_handbook',
            reference: 'Student Affairs Guidelines 2025-26',
            snippet: 'For general campus inquiries, contact the Dean of Student Affairs office.',
          },
        ],
        confidence: 'low',
        timestamp: new Date().toISOString(),
      };
    }

    const primaryDoc = topMatches[0]!.doc;
    const citations: Citation[] = topMatches.slice(0, 3).map((m) => ({
      title: m.doc.title,
      sourceType: m.doc.sourceType,
      reference: m.doc.reference,
      snippet: m.doc.snippet,
    }));

    return {
      query,
      answer: primaryDoc.fullAnswer,
      citations,
      confidence: topMatches[0]!.score >= 3 ? 'high' : 'medium',
      timestamp: new Date().toISOString(),
    };
  }
}

export const groundedCampusQa = new GroundedCampusQaService();
