/**
 * IIT Mandi Campus Connector Configuration (Section 12)
 *
 * IMPORTANT: Base URLs below use safe, explicit placeholders by default so the app
 * never guesses or hammers internal campus servers without configuration.
 * See README.md ("How to find and set these Campus URLs") to point them to your
 * verified Moodle/LMS instance, or keep `DEMO_MODE=true` to use realistic IIT Mandi fixtures.
 */

export const campusConfig = {
  userAgent: 'KamandChat-CampusConnector/1.0 (+https://github.com/kamandprompt/kamand-chat)',
  moodleBaseUrl:
    process.env.MOODLE_BASE_URL || 'https://placeholder-lms.iitmandi.example.edu',
  academicPortalBaseUrl:
    process.env.ACADEMIC_PORTAL_BASE_URL || 'https://placeholder-oas.iitmandi.example.edu',
  publicInstituteBaseUrl:
    process.env.PUBLIC_INSTITUTE_BASE_URL || 'https://placeholder-public.iitmandi.example.edu',
  weatherApiUrl:
    process.env.MANDI_WEATHER_API_URL ||
    'https://api.open-meteo.com/v1/forecast?latitude=31.7754&longitude=76.9861&current_weather=true',
  maxProbeFailures: 3,
  backoffCooldownMs: 24 * 60 * 60 * 1000, // 24 hours after 3 consecutive failures
  probeTimeoutMs: 4500,
};

/**
 * Official Moodle Web Services functions supported by the Moodle Connector (§12.1).
 */
export const MOODLE_WS_FUNCTIONS = [
  'core_webservice_get_site_info',
  'core_enrol_get_users_courses',
  'core_course_get_contents',
  'mod_assign_get_assignments',
  'mod_quiz_get_quizzes_by_courses',
  'core_calendar_get_calendar_upcoming_view',
  'gradereport_user_get_grade_items',
  'message_popup_get_popup_notifications',
  'mod_forum_get_forums_by_courses',
] as const;
