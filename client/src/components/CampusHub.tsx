import React, { useEffect, useState } from 'react';
import {
  GraduationCap,
  Clock,
  Utensils,
  Bus,
  CloudSun,
  ShieldCheck,
  RefreshCw,
  Unlink,
  Link2,
  BookOpen,
  Sparkles,
  Plus,
  ThumbsUp,
  AlertTriangle,
} from 'lucide-react';
import type { CampusDatumCategory } from '@kamand/shared';
import { useCampusStore } from '../store/useCampusStore.js';
import { apiFetch } from '../lib/api.js';
import { FluidSheet } from './FluidSheet.js';

export const CampusHub: React.FC = () => {
  const {
    connectors,
    today,
    freeSlots,
    groundedAnswer,
    loadCampusDashboard,
    connectMoodle,
    disconnectConnector,
    retryConnectorProbe,
    addTimetableSlot,
    loadFreeSlots,
    createServiceItem,
    upvoteServiceItem,
    askGroundedCampusAi,
  } = useCampusStore();

  const [activeSubTab, setActiveSubTab] = useState<
    'today' | 'timetable' | 'services' | 'connectors'
  >('today');
  const [isMoodleConsentOpen, setIsMoodleConsentOpen] = useState(false);
  const [moodleMode, setMoodleMode] = useState<'token' | 'ics_url'>('token');
  const [moodleTokenInput, setMoodleTokenInput] = useState('demo-moodle-mobile-token-b26343');
  const [moodleIcsInput, setMoodleIcsInput] = useState('');
  const [campusQuestion, setCampusQuestion] = useState('');

  // Timetable form state
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'>('Wed');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('10:55');
  const [roomCode, setRoomCode] = useState('A13-LH1');

  // Campus service post state
  const [serviceCat, setServiceCat] = useState<CampusDatumCategory>('lost_found');
  const [serviceTitle, setServiceTitle] = useState('');
  const [serviceSubtitle, setServiceSubtitle] = useState('');
  const [serviceBody, setServiceBody] = useState('');
  const [serviceLocation, setServiceLocation] = useState('B-19');

  // 6 Campus Mess Halls
  const MESS_HALLS = [
    { id: 'Pine Mess', label: 'Pine Mess', campus: 'South Campus', tag: 'Pure Veg & Regional' },
    { id: 'Oak Mess', label: 'Oak Mess', campus: 'South Campus', tag: 'Veg & Non-Veg' },
    { id: 'Cedar Mess', label: 'Cedar Mess', campus: 'North Campus', tag: 'North & South Indian' },
    { id: 'Alder Mess', label: 'Alder Mess', campus: 'North Campus', tag: 'Central Student Mess' },
    { id: 'Maple Mess', label: 'Maple Mess', campus: 'D1 / D2 Cluster', tag: 'Fresh Bakery & Thali' },
    { id: 'Peepal Mess', label: 'Peepal Mess', campus: 'North Complex', tag: 'Multicuisine Hub' },
  ] as const;

  const [selectedMess, setSelectedMess] = useState<string>('Pine Mess');
  const [currentMeal, setCurrentMeal] = useState<{
    meal: string;
    hostel: string;
    items: string[];
    timing: string;
    isVegetarian: boolean;
  } | null>(null);
  const [messLoading, setMessLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchMess = async () => {
      setMessLoading(true);
      try {
        const res = await apiFetch<{
          success: boolean;
          data: {
            meal: string;
            hostel: string;
            items: string[];
            timing: string;
            isVegetarian: boolean;
          };
        }>(`/api/campus/mess/current?mess=${encodeURIComponent(selectedMess)}`);
        if (!cancelled && res.success) {
          setCurrentMeal(res.data);
        }
      } catch {
        // Fallback gracefully without breaking UI
      } finally {
        if (!cancelled) setMessLoading(false);
      }
    };
    void fetchMess();
    return () => {
      cancelled = true;
    };
  }, [selectedMess]);

  useEffect(() => {
    void loadCampusDashboard();
    void loadFreeSlots('Wed');
  }, [loadCampusDashboard, loadFreeSlots]);

  if (!today) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
        Loading IIT Mandi Campus Layer…
      </div>
    );
  }

  const moodleConnector = connectors.find((c) => c.id === 'moodle_lms');

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Top Floating Chrome */}
      <header className="px-6 py-4 glass-chrome glass-top-highlight border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-sky-400" />
            <h1 className="text-heading text-lg text-white">IIT Mandi Campus Hub</h1>
            {today.studentProfile.rollNumber && (
              <span className="px-2 py-0.5 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-300 text-xs font-semibold">
                {today.studentProfile.rollNumber} · {today.studentProfile.academicYearLabel}
              </span>
            )}
          </div>
          <p className="text-caption text-slate-400 mt-0.5">
            Optional connectors with “Try, Then Degrade” resilience · Zero passwords stored
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-2xl border border-white/10">
          {(
            [
              { id: 'today', label: 'Today' },
              { id: 'timetable', label: 'Timetable' },
              { id: 'services', label: 'Services & SOS' },
              { id: 'connectors', label: 'Connected Accounts' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`fluid-press px-3 py-1.5 rounded-xl text-xs font-semibold ${activeSubTab === tab.id
                  ? 'bg-sky-500 text-white'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Scroll */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-edge-mask">
        {activeSubTab === 'today' && (
          <>
            {/* Top Status Row: Weather + Moodle Connection Action */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {today.weather && (
                <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                      <CloudSun className="w-4 h-4" />
                      <span>{today.weather.location}</span>
                    </div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {today.weather.temperatureC}°C · {today.weather.condition}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Humidity {today.weather.humidityPercent}% · Wind {today.weather.windKmh} km/h
                    </div>
                  </div>
                </div>
              )}

              {/* Moodle Connector Summary Card */}
              <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Moodle LMS Connector</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {today.moodle.uiVisible
                      ? `Connected · Last synced ${new Date(
                        today.moodle.lastSyncAt || Date.now()
                      ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'Not connected · Your app works 100% without LMS login.'}
                  </p>
                </div>

                {today.moodle.uiVisible ? (
                  <button
                    type="button"
                    onClick={() => void disconnectConnector('moodle_lms')}
                    className="fluid-press px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Disconnect & Delete Cache</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsMoodleConsentOpen(true)}
                    className="fluid-press px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Connect Moodle</span>
                  </button>
                )}
              </div>
            </div>

            {/* Moodle Deadlines & Courses (Rendered ONLY when connector `uiVisible` is true - §12 Try, Then Degrade) */}
            {today.moodle.uiVisible && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="moodle-dashboard-widget">
                <div className="p-4 rounded-3xl bg-slate-900/80 border border-sky-500/25 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-heading text-sm text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-sky-400" />
                      <span>Upcoming Moodle Deadlines</span>
                    </h2>
                    <span className="text-[11px] text-emerald-300">Official Web Services API</span>
                  </div>

                  <div className="space-y-2">
                    {today.moodle.deadlines.map((dl) => {
                      const hoursLeft = Math.max(
                        1,
                        Math.round((new Date(dl.dueAt).getTime() - Date.now()) / 3600_000)
                      );
                      return (
                        <div
                          key={dl.id}
                          className="p-3 rounded-2xl bg-slate-950 border border-white/10 flex items-center justify-between gap-2"
                        >
                          <div>
                            <span className="text-xs font-bold text-sky-300">{dl.courseCode}</span>
                            <div className="text-xs font-medium text-white">{dl.title}</div>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 text-xs font-semibold flex-shrink-0">
                            In {hoursLeft}h
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 space-y-3">
                  <h2 className="text-heading text-sm text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-sky-400" />
                    <span>Enrolled Courses & Grade Tracker</span>
                  </h2>
                  <div className="space-y-2">
                    {today.moodle.courses.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 rounded-2xl bg-slate-950 border border-white/10 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-semibold text-white">{c.fullname}</div>
                          <div className="text-[11px] text-slate-400">
                            Room {c.roomCode} · {c.modules.length} cached resources
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs font-bold">
                          {c.gradePercent}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Public Institute Widgets: All 6 Campus Mess Halls & Kamand Bus Schedule */}
            {today.publicData.uiVisible && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-heading text-sm text-white flex items-center gap-2">
                      <Utensils className="w-4 h-4 text-emerald-400" />
                      <span>Campus Mess Halls ({selectedMess})</span>
                    </h2>
                    {currentMeal && (
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-semibold">
                        {currentMeal.meal} · {currentMeal.timing}
                      </span>
                    )}
                  </div>

                  {/* Mess Hall Selector Pills */}
                  <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-slate-950/70 border border-white/10">
                    {MESS_HALLS.map((m) => {
                      const isSelected = selectedMess === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMess(m.id)}
                          className={`fluid-press px-2.5 py-1 rounded-xl text-[11px] font-medium transition-all ${isSelected
                              ? 'bg-emerald-500 text-white font-semibold shadow-sm'
                              : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Current Active Meal Card */}
                  {currentMeal ? (
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-emerald-300">
                          {currentMeal.meal} Menu — {currentMeal.hostel}
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-850 text-slate-300 border border-white/10">
                          {MESS_HALLS.find((m) => m.id === selectedMess)?.campus}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {currentMeal.items.map((item, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-200 text-xs font-medium"
                          >
                            🍽️ {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : messLoading ? (
                    <div className="p-4 rounded-2xl bg-slate-950 border border-white/10 text-center text-xs text-slate-400">
                      Loading {selectedMess} menu…
                    </div>
                  ) : null}

                  {/* Extra Notices / Fallback notices */}
                  {today.publicData.messMenu.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {today.publicData.messMenu.map((m) => (
                        <div key={m.id} className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 text-xs">
                          <span className="font-semibold text-sky-300">{m.title}: </span>
                          <span className="text-slate-400">{m.body}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 space-y-2.5">
                  <h2 className="text-heading text-sm text-white flex items-center gap-2">
                    <Bus className="w-4 h-4 text-sky-400" />
                    <span>Kamand ↔ Mandi Bus Timings</span>
                  </h2>
                  {today.publicData.buses.map((b) => (
                    <div key={b.id} className="p-3 rounded-2xl bg-slate-950 border border-white/10">
                      <div className="text-xs font-semibold text-sky-300">{b.title}</div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{b.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grounded Campus AI Assistant with Source Citations */}
            <div className="p-4 rounded-3xl bg-slate-900/90 border border-sky-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
                  <Sparkles className="w-4 h-4" />
                  <span>Grounded IIT Mandi AI Assistant (With Citations · Never Guesses)</span>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!campusQuestion.trim()) return;
                  void askGroundedCampusAi(campusQuestion);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={campusQuestion}
                  onChange={(e) => setCampusQuestion(e.target.value)}
                  placeholder="Ask about Pine Mess menu, bus timings, IC-152 deadlines, or helplines…"
                  aria-label="Ask Grounded Campus AI"
                  className="flex-1 rounded-xl bg-slate-950 border border-white/15 px-3.5 py-2 text-xs text-white"
                />
                <button
                  type="submit"
                  className="fluid-press px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold"
                >
                  Ask Campus AI
                </button>
              </form>

              {groundedAnswer && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/10 space-y-2 text-xs">
                  <div className="whitespace-pre-wrap text-slate-200">{groundedAnswer.answer}</div>
                  {groundedAnswer.citations.length > 0 && (
                    <div className="pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                      {groundedAnswer.citations.map((cit, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 text-[10px]"
                        >
                          Source: {cit.source} — {cit.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {activeSubTab === 'timetable' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-heading text-base text-white">My Class & Lab Timetable</h2>
              <div className="space-y-2">
                {today.timetable.map((slot) => (
                  <div
                    key={slot.id}
                    className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-xs font-bold">
                          {slot.courseCode}
                        </span>
                        <span className="text-sm font-semibold text-white">{slot.courseTitle}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {slot.dayOfWeek} · {slot.startTime} – {slot.endTime}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-white/10 text-xs font-semibold text-slate-200">
                      Room {slot.roomCode}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
                <div className="text-xs font-semibold text-emerald-300">
                  Opt-In Free-Slot Finder (Wednesday)
                </div>
                <div className="flex flex-wrap gap-2">
                  {freeSlots.map((hr) => (
                    <span
                      key={hr}
                      className="px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-xs font-medium"
                    >
                      Free at {hr}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!courseCode.trim() || !courseTitle.trim()) return;
                await addTimetableSlot({
                  courseCode,
                  courseTitle,
                  dayOfWeek,
                  startTime,
                  endTime,
                  roomCode,
                });
                setCourseCode('');
                setCourseTitle('');
              }}
              className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 space-y-3 h-fit"
            >
              <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-sky-400" />
                Add Course Slot
              </h3>
              <input
                type="text"
                required
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="Course Code (e.g. IC-114)"
                className="w-full rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
              />
              <input
                type="text"
                required
                value={courseTitle}
                onChange={(e) => setCourseTitle(e.target.value)}
                placeholder="Course Title (e.g. Linear Algebra)"
                className="w-full rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value as typeof dayOfWeek)}
                  className="rounded-xl bg-slate-950 border border-white/15 px-2 py-2 text-xs text-white"
                >
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-xl bg-slate-950 border border-white/15 px-2 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-xl bg-slate-950 border border-white/15 px-2 py-2 text-xs text-white"
                />
              </div>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="Room Code (e.g. A13-LH1)"
                className="w-full rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
              />
              <button
                type="submit"
                className="fluid-press w-full py-2.5 rounded-xl bg-sky-500 text-white text-xs font-semibold"
              >
                Save Timetable Slot
              </button>
            </form>
          </div>
        )}

        {activeSubTab === 'services' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-heading text-base text-white">
                Campus Services (Lost & Found, Ride Share, Club Events, Study Buddy, SOS)
              </h2>
              <div className="space-y-2.5">
                {today.publicData.services.map((srv) => (
                  <div
                    key={srv.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[10px] font-bold uppercase">
                          {srv.category.replace('_', ' ')}
                        </span>
                        {srv.locationCode && (
                          <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 text-[10px]">
                            📍 {srv.locationCode}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-white">{srv.title}</h3>
                      {srv.subtitle && <p className="text-xs text-sky-300">{srv.subtitle}</p>}
                      <p className="text-xs text-slate-300">{srv.body}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void upvoteServiceItem(srv.id)}
                      className="fluid-press px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 flex items-center gap-1.5"
                    >
                      <ThumbsUp className="w-3.5 h-3.5 text-sky-400" />
                      <span>{srv.upvotes}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!serviceTitle.trim() || !serviceBody.trim()) return;
                await createServiceItem({
                  category: serviceCat,
                  title: serviceTitle,
                  subtitle: serviceSubtitle,
                  body: serviceBody,
                  locationCode: serviceLocation,
                  eventTime: '',
                });
                setServiceTitle('');
                setServiceSubtitle('');
                setServiceBody('');
              }}
              className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 space-y-3 h-fit"
            >
              <h3 className="text-xs font-semibold text-white">Post to Campus Services</h3>
              <select
                value={serviceCat}
                onChange={(e) => setServiceCat(e.target.value as CampusDatumCategory)}
                className="w-full rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
              >
                <option value="lost_found">Lost & Found</option>
                <option value="ride_share">Cab / Ride Sharing</option>
                <option value="marketplace">Student Marketplace</option>
                <option value="club_event">Club Event RSVP</option>
                <option value="study_buddy">Study Buddy Matching</option>
                <option value="mess_poll">Mess Menu Poll</option>
                <option value="anonymous_feedback">Moderated Anonymous Feedback</option>
                <option value="sos_alert">Emergency Campus SOS</option>
              </select>
              <input
                type="text"
                required
                value={serviceTitle}
                onChange={(e) => setServiceTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
              />
              <input
                type="text"
                value={serviceLocation}
                onChange={(e) => setServiceLocation(e.target.value)}
                placeholder="Campus Landmark / Room (e.g. B-19, Library)"
                className="w-full rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
              />
              <textarea
                rows={3}
                required
                value={serviceBody}
                onChange={(e) => setServiceBody(e.target.value)}
                placeholder="Details…"
                className="w-full rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white"
              />
              <button
                type="submit"
                className="fluid-press w-full py-2.5 rounded-xl bg-sky-500 text-white text-xs font-semibold"
              >
                Publish Listing
              </button>
            </form>
          </div>
        )}

        {activeSubTab === 'connectors' && (
          <div className="space-y-4">
            <h2 className="text-heading text-base text-white">
              Connected Accounts & “Try, Then Degrade” Health
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connectors.map((conn) => (
                <div
                  key={conn.id}
                  className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{conn.name}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${conn.status === 'connected'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : conn.status === 'degraded_hidden'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                    >
                      {conn.status === 'connected'
                        ? 'Connected'
                        : conn.status === 'degraded_hidden'
                          ? 'Degraded (UI Hidden)'
                          : 'Not Connected'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{conn.description}</p>
                  {conn.lastError && (
                    <p className="text-[11px] text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Quiet log: {conn.lastError}</span>
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    {conn.id === 'moodle_lms' && conn.status !== 'connected' && (
                      <button
                        type="button"
                        onClick={() => setIsMoodleConsentOpen(true)}
                        className="fluid-press px-3 py-1.5 rounded-xl bg-sky-500 text-white text-xs font-semibold"
                      >
                        Connect with Consent
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void retryConnectorProbe(conn.id)}
                      className="fluid-press px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-200 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Try Again</span>
                    </button>

                    {conn.id === 'moodle_lms' && conn.status === 'connected' && (
                      <button
                        type="button"
                        onClick={() => void disconnectConnector('moodle_lms')}
                        className="fluid-press px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 text-xs font-medium"
                      >
                        Disconnect & Purge
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {moodleConnector && (
              <p className="text-[11px] text-slate-500">
                All tokens are encrypted at rest with a per-user HKDF AES-256-GCM key. Institute
                passwords are never stored.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Consent Screen Before Connecting Moodle (§12 Hard Rule) */}
      <FluidSheet
        isOpen={isMoodleConsentOpen}
        onClose={() => setIsMoodleConsentOpen(false)}
        title="Connect IIT Mandi Moodle LMS · Data Consent"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await connectMoodle({
              explicitConsent: true,
              mode: moodleMode,
              token: moodleMode === 'token' ? moodleTokenInput : undefined,
              icsUrl: moodleMode === 'ics_url' ? moodleIcsInput : undefined,
            });
            setIsMoodleConsentOpen(false);
          }}
          className="space-y-4"
        >
          <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-400/30 space-y-1.5 text-xs text-slate-200">
            <div className="font-semibold text-sky-300">What is read from your Moodle account:</div>
            <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-1">
              <li>Your enrolled courses (`core_enrol_get_users_courses`)</li>
              <li>Assignment & quiz deadlines (`mod_assign_get_assignments`, `mod_quiz_get_quizzes_by_courses`)</li>
              <li>Your own course grades (`gradereport_user_get_grade_items`)</li>
              <li>Never reads other students’ data. Never stores your institute password.</li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMoodleMode('token')}
              className={`py-2 rounded-xl border text-xs font-semibold ${moodleMode === 'token'
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-slate-900 border-white/10 text-slate-400'
                }`}
            >
              Moodle Mobile Token
            </button>
            <button
              type="button"
              onClick={() => setMoodleMode('ics_url')}
              className={`py-2 rounded-xl border text-xs font-semibold ${moodleMode === 'ics_url'
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-slate-900 border-white/10 text-slate-400'
                }`}
            >
              Calendar Export ICS URL
            </button>
          </div>

          {moodleMode === 'token' ? (
            <input
              type="text"
              required
              value={moodleTokenInput}
              onChange={(e) => setMoodleTokenInput(e.target.value)}
              placeholder="Paste Moodle Mobile Web Services Token"
              className="w-full rounded-xl bg-slate-900 border border-white/15 px-3.5 py-2.5 text-xs text-white"
            />
          ) : (
            <input
              type="url"
              required
              value={moodleIcsInput}
              onChange={(e) => setMoodleIcsInput(e.target.value)}
              placeholder="https://lms.iitmandi.ac.in/calendar/export_execute.php?..."
              className="w-full rounded-xl bg-slate-900 border border-white/15 px-3.5 py-2.5 text-xs text-white"
            />
          )}

          <button
            type="submit"
            className="fluid-press w-full min-h-[44px] rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold"
          >
            Consent & Connect Moodle LMS
          </button>
        </form>
      </FluidSheet>
    </div>
  );
};
