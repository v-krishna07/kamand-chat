import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  Bus,
  Utensils,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Phone,
  Clock,
  MapPin,
  Users,
  Search,
  Sparkles,
  BookOpen,
  Send,
  Plus,
  Trash2,
} from 'lucide-react';
import type { UserSummary, FreeSlotDTO } from '@kamand/shared';
import { useCampusStore } from '../store/useCampusStore.js';
import { useSocialStore } from '../store/useSocialStore.js';
import { FluidSheet } from './FluidSheet.js';

interface CampusDashboardProps {
  currentUser: UserSummary;
}

type CampusSubTab = 'today' | 'timetable' | 'buses' | 'mess' | 'directory' | 'ai';

export const CampusDashboard: React.FC<CampusDashboardProps> = ({ currentUser }) => {
  const {
    todaySummary,
    timetableSlots,
    busSchedule,
    messMenu,
    services,
    campusHealth,
    isSyncingMoodle,
    qaHistory,
    isAskingQa,
    loadTodaySummary,
    loadCourses,
    syncMoodle,
    loadTimetable,
    queryFreeSlots,
    loadBusSchedule,
    loadMessMenu,
    loadServices,
    loadHealth,
    askCampusAi,
    adminCreateBusTrip,
    adminDeleteBusTrip,
    adminUpdateMessMeal,
  } = useCampusStore();

  const { contacts, loadContacts } = useSocialStore();

  const [activeTab, setActiveTab] = useState<CampusSubTab>('today');
  const [selectedHostel, setSelectedHostel] = useState('Oak Mess');
  const [qaInput, setQaInput] = useState('');

  // Free-slot modal state
  const [isFreeSlotModalOpen, setIsFreeSlotModalOpen] = useState(false);
  const [selectedPeerIds, setSelectedPeerIds] = useState<string[]>([]);
  const [freeSlotDay, setFreeSlotDay] = useState<
    'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday'
  >('Monday');
  const [calculatedSlots, setCalculatedSlots] = useState<FreeSlotDTO[]>([]);

  // Admin Bus Trip modal state
  const [isAddBusOpen, setIsAddBusOpen] = useState(false);
  const [newBusRoute, setNewBusRoute] = useState('North Campus -> South Campus');
  const [newBusFrom, setNewBusFrom] = useState('North Campus (Mind Tree)');
  const [newBusTo, setNewBusTo] = useState('South Campus (Main Gate)');
  const [newBusTime, setNewBusTime] = useState('11:00');

  // Admin Mess Meal modal state
  const [isEditMessOpen, setIsEditMessOpen] = useState(false);
  const [editMealType, setEditMealType] = useState<
    'breakfast' | 'lunch' | 'snacks' | 'dinner'
  >('lunch');
  const [editMealItems, setEditMealItems] = useState('Rajma Madra, Steamed Rice, Phulka Roti');

  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'super_admin';

  useEffect(() => {
    void loadTodaySummary();
    void loadCourses();
    void loadTimetable();
    void loadBusSchedule();
    void loadMessMenu(selectedHostel);
    void loadServices();
    void loadHealth();
    void loadContacts();
  }, [loadTodaySummary, loadCourses, loadTimetable, loadBusSchedule, loadMessMenu, loadServices, loadHealth, loadContacts, selectedHostel]);

  const handleMoodleSync = async () => {
    await syncMoodle();
  };

  const handleCalculateFreeSlots = async () => {
    const userIds = [currentUser.id, ...selectedPeerIds];
    const results = await queryFreeSlots({
      userIds,
      dayOfWeek: freeSlotDay,
      windowStart: '08:00',
      windowEnd: '18:00',
      minDurationMins: 30,
    });
    setCalculatedSlots(results);
  };

  const handleAskCampusAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaInput.trim() || isAskingQa) return;
    const q = qaInput.trim();
    setQaInput('');
    await askCampusAi(q);
  };

  const handleAddBus = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminCreateBusTrip({
      routeName: newBusRoute,
      fromLocation: newBusFrom,
      toLocation: newBusTo,
      departureTime: newBusTime,
      daysOfWeek: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',
      busType: 'Electric Bus',
      isWeekendOnly: false,
    });
    setIsAddBusOpen(false);
  };

  const handleUpdateMess = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminUpdateMessMeal({
      hostelName: selectedHostel,
      dayOfWeek: 'Monday',
      mealType: editMealType,
      items: editMealItems.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setIsEditMessOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-slate-950 overflow-hidden">
      {/* Top Header */}
      <header className="px-6 py-4 glass-chrome border-b border-white/10 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-heading text-lg text-white">IIT Mandi Campus</h1>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-mono">
                Kamand Valley
              </span>
            </div>
            <p className="text-caption text-slate-400 text-xs">
              Moodle LMS · Timetable Free Slots · Valley Buses · Mess Menus · Emergency
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connector Status Pill */}
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 ${
              campusHealth?.overallStatus === 'healthy'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                campusHealth?.overallStatus === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'
              } animate-pulse`}
            />
            <span>
              {campusHealth?.overallStatus === 'healthy' ? 'Moodle Connected' : 'Campus Fallback Active'}
            </span>
          </div>

          <button
            type="button"
            disabled={isSyncingMoodle}
            onClick={() => void handleMoodleSync()}
            className="fluid-press px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300 text-xs font-semibold flex items-center gap-1.5"
            title="Sync Courses and Assignments from Moodle"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingMoodle ? 'animate-spin' : ''}`} />
            <span>{isSyncingMoodle ? 'Syncing…' : 'Sync Moodle'}</span>
          </button>
        </div>
      </header>

      {/* Campus Navigation Tabs */}
      <div className="px-6 py-2.5 glass-chrome border-b border-white/10 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
        {[
          { id: 'today', label: 'Today', icon: Calendar },
          { id: 'timetable', label: 'Timetable & Free Slots', icon: Clock },
          { id: 'buses', label: 'Buses & Commute', icon: Bus },
          { id: 'mess', label: 'Mess Menu', icon: Utensils },
          { id: 'directory', label: 'Directory & Clinic', icon: Phone },
          { id: 'ai', label: 'Campus AI (Citations)', icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as CampusSubTab)}
              className={`fluid-press px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                isSelected
                  ? 'bg-sky-500 text-white shadow-xs'
                  : 'bg-slate-900 border border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Degradation Alert Banner (Try, Then Degrade §13) */}
        {todaySummary?.connectorsStatus !== 'healthy' && (
          <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-start gap-3 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-100">
                Moodle Web Services Offline · Degraded Mode Active
              </span>
              <p className="text-[11px] text-amber-200/80 mt-0.5">
                The official Moodle API is currently unreachable. Kamand Chat is serving cached
                course schedules and calendar assignments without interrupting messaging or
                timetables.
              </p>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 1: TODAY AT KAMAND */}
        {/* ==================================================================== */}
        {activeTab === 'today' && (
          <div className="space-y-6">
            {/* Hero Summary Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Next Class */}
              <div className="p-4 rounded-3xl bg-slate-900/90 border border-white/10 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1 font-semibold text-sky-400">
                    <Clock className="w-3.5 h-3.5" /> Next Class Today
                  </span>
                  {todaySummary?.nextClass?.slotCode && (
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                      Slot {todaySummary.nextClass.slotCode}
                    </span>
                  )}
                </div>

                <div className="my-3">
                  <h3 className="text-base font-semibold text-white">
                    {todaySummary?.nextClass?.title || 'No upcoming classes today!'}
                  </h3>
                  {todaySummary?.nextClass && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-300">
                      <span className="text-emerald-400 font-mono">
                        {todaySummary.nextClass.startTime} – {todaySummary.nextClass.endTime}
                      </span>
                      <span>·</span>
                      <span className="px-2 py-0.5 rounded bg-white/10 text-white font-medium flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-sky-400" />
                        {todaySummary.nextClass.location}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('timetable')}
                  className="fluid-press text-left text-[11px] font-medium text-sky-400 hover:text-sky-300"
                >
                  View full weekly schedule →
                </button>
              </div>

              {/* Next Valley Bus */}
              <div className="p-4 rounded-3xl bg-slate-900/90 border border-white/10 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1 font-semibold text-emerald-400">
                    <Bus className="w-3.5 h-3.5" /> Next Bus
                  </span>
                  {todaySummary?.nextBus?.busType && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      {todaySummary.nextBus.busType}
                    </span>
                  )}
                </div>

                <div className="my-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono text-white">
                      {todaySummary?.nextBus?.departureTime || '08:15'}
                    </span>
                    {typeof todaySummary?.nextBus?.minutesUntilDeparture === 'number' && (
                      <span className="text-xs text-emerald-400 font-semibold">
                        (in {todaySummary.nextBus.minutesUntilDeparture}m)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {todaySummary?.nextBus?.routeName || 'North Campus -> South Campus'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('buses')}
                  className="fluid-press text-left text-[11px] font-medium text-emerald-400 hover:text-emerald-300"
                >
                  View all bus departures →
                </button>
              </div>

              {/* Current Mess Meal */}
              <div className="p-4 rounded-3xl bg-slate-900/90 border border-white/10 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1 font-semibold text-amber-400">
                    <Utensils className="w-3.5 h-3.5" /> Mess Meal
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase">
                    {todaySummary?.currentMeal?.mealType || 'Dinner'}
                  </span>
                </div>

                <div className="my-3">
                  <h3 className="text-sm font-semibold text-white">
                    {todaySummary?.currentMeal?.hostelName || 'Oak Mess'}
                  </h3>
                  <div className="text-xs text-slate-300 mt-1 line-clamp-2">
                    {todaySummary?.currentMeal?.items.join(' · ') ||
                      'Paneer Butter Masala · Dal Tadka · Jeera Rice · Tandoori Roti'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('mess')}
                  className="fluid-press text-left text-[11px] font-medium text-amber-400 hover:text-amber-300"
                >
                  View 7-day mess menu →
                </button>
              </div>
            </div>

            {/* Upcoming Assignments & Deadlines */}
            <div className="p-5 rounded-3xl bg-slate-900/70 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-sky-400" />
                  <h2 className="text-sm font-semibold text-white">
                    Upcoming Moodle Assignments & Deadlines
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={isSyncingMoodle}
                  onClick={() => void handleMoodleSync()}
                  className="text-xs text-sky-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncingMoodle ? 'animate-spin' : ''}`} />
                  Sync
                </button>
              </div>

              {todaySummary?.upcomingAssignments.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">
                  All assignments caught up! No pending deadlines for this week.
                </p>
              ) : (
                <div className="space-y-2">
                  {todaySummary?.upcomingAssignments.map((a) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-2xl bg-slate-950 border border-white/10 flex items-center justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[10px] font-bold">
                            {a.courseCode}
                          </span>
                          <span className="text-xs font-semibold text-white truncate">
                            {a.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{a.description}</p>
                      </div>

                      <div className="flex items-center gap-3 ml-4 flex-shrink-0 text-right">
                        <div>
                          <div
                            className={`text-xs font-bold ${
                              a.daysRemaining <= 2 ? 'text-rose-400' : 'text-amber-300'
                            }`}
                          >
                            Due in {a.daysRemaining}d
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(a.dueDate).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                        </div>

                        {a.submissionUrl && (
                          <a
                            href={a.submissionUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="fluid-press px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 text-xs font-medium"
                          >
                            Open
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Emergency Numbers */}
            <div className="p-4 rounded-3xl bg-slate-900/50 border border-white/10 space-y-2">
              <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-rose-400" />
                <span>24x7 Campus Emergency & Medical Contacts</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {todaySummary?.quickContacts.map((c) => (
                  <div
                    key={c.id}
                    className="p-2.5 rounded-xl bg-slate-950 border border-white/10 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-medium text-white">{c.title}</div>
                      <div className="text-[10px] text-slate-400">{c.location}</div>
                    </div>
                    <a
                      href={`tel:${c.phone}`}
                      className="fluid-press px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-bold"
                    >
                      {c.phone}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: TIMETABLE & FREE-SLOT FINDER */}
        {/* ==================================================================== */}
        {activeTab === 'timetable' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Weekly Class Timetable</h2>
                <p className="text-xs text-slate-400">
                  Assigned slots from your enrolled courses at IIT Mandi.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsFreeSlotModalOpen(true)}
                className="fluid-press px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-sky-500/20"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Find Free Slots with Peers</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const).map((day) => {
                const daySlots = timetableSlots.filter((s) => s.dayOfWeek === day);
                return (
                  <div
                    key={day}
                    className="p-3 rounded-2xl bg-slate-900 border border-white/10 space-y-2"
                  >
                    <div className="text-xs font-bold text-sky-300 border-b border-white/10 pb-1.5 flex items-center justify-between">
                      <span>{day}</span>
                      <span className="text-[10px] text-slate-500 font-normal">
                        {daySlots.length} class{daySlots.length === 1 ? '' : 'es'}
                      </span>
                    </div>

                    {daySlots.length === 0 ? (
                      <div className="py-6 text-center text-[11px] text-slate-500">
                        No classes scheduled
                      </div>
                    ) : (
                      daySlots.map((s) => (
                        <div
                          key={s.id}
                          className="p-2.5 rounded-xl bg-slate-950 border border-sky-500/20 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-white">{s.title}</span>
                            {s.slotCode && (
                              <span className="text-[9px] px-1 rounded bg-sky-500/20 text-sky-300">
                                {s.slotCode}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-emerald-400 font-mono">
                            {s.startTime} - {s.endTime}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-sky-400" />
                            <span>{s.location}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: BUSES & COMMUTE */}
        {/* ==================================================================== */}
        {activeTab === 'buses' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  North & South Campus Transit (Valley Electric Buses)
                </h2>
                <p className="text-xs text-slate-400">
                  Regular shuttles connecting Mind Tree, Pine, Cedar, A1, A2, and Mandi Town.
                </p>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsAddBusOpen(true)}
                  className="fluid-press px-3 py-1.5 rounded-xl bg-sky-500 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Bus Trip</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* North to South */}
              <div className="p-4 rounded-3xl bg-slate-900 border border-white/10 space-y-3">
                <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                  <Bus className="w-4 h-4 text-sky-400" />
                  <span>North Campus → South Campus</span>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {busSchedule
                    .filter((t) => t.routeName.includes('North Campus -> South'))
                    .map((trip) => (
                      <div
                        key={trip.id}
                        className={`p-3 rounded-2xl border flex items-center justify-between ${
                          trip.isNext
                            ? 'bg-sky-500/15 border-sky-400'
                            : 'bg-slate-950 border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-mono font-bold text-white">
                            {trip.departureTime}
                          </span>
                          <div>
                            <div className="text-xs text-slate-300 font-medium">
                              From: {trip.fromLocation}
                            </div>
                            <div className="text-[10px] text-slate-400">{trip.busType}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {trip.isNext ? (
                            <span className="px-2 py-0.5 rounded-full bg-sky-500 text-white text-[10px] font-bold">
                              NEXT BUS
                            </span>
                          ) : typeof trip.minutesUntilDeparture === 'number' ? (
                            <span className="text-xs text-slate-400 font-mono">
                              in {trip.minutesUntilDeparture}m
                            </span>
                          ) : null}

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => void adminDeleteBusTrip(trip.id)}
                              className="p-1 text-slate-500 hover:text-rose-400"
                              title="Delete Trip"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* South to North */}
              <div className="p-4 rounded-3xl bg-slate-900 border border-white/10 space-y-3">
                <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <Bus className="w-4 h-4 text-emerald-400" />
                  <span>South Campus → North Campus</span>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {busSchedule
                    .filter((t) => t.routeName.includes('South Campus -> North'))
                    .map((trip) => (
                      <div
                        key={trip.id}
                        className={`p-3 rounded-2xl border flex items-center justify-between ${
                          trip.isNext
                            ? 'bg-emerald-500/15 border-emerald-400'
                            : 'bg-slate-950 border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-mono font-bold text-white">
                            {trip.departureTime}
                          </span>
                          <div>
                            <div className="text-xs text-slate-300 font-medium">
                              From: {trip.fromLocation}
                            </div>
                            <div className="text-[10px] text-slate-400">{trip.busType}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {trip.isNext ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                              NEXT BUS
                            </span>
                          ) : typeof trip.minutesUntilDeparture === 'number' ? (
                            <span className="text-xs text-slate-400 font-mono">
                              in {trip.minutesUntilDeparture}m
                            </span>
                          ) : null}

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => void adminDeleteBusTrip(trip.id)}
                              className="p-1 text-slate-500 hover:text-rose-400"
                              title="Delete Trip"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 4: MESS MENU */}
        {/* ==================================================================== */}
        {activeTab === 'mess' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Hostel Mess Menus</h2>
                <p className="text-xs text-slate-400">
                  Daily meal plans across Oak, Pine, Cedar, and Alder messes.
                </p>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsEditMessOpen(true)}
                  className="fluid-press px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold"
                >
                  Edit Menu
                </button>
              )}
            </div>

            {/* Hostel Selector Tabs */}
            <div className="flex items-center gap-2">
              {['Oak Mess', 'Pine Mess', 'Cedar Mess', 'Alder Mess'].map((hostel) => (
                <button
                  key={hostel}
                  type="button"
                  onClick={() => {
                    setSelectedHostel(hostel);
                    void loadMessMenu(hostel);
                  }}
                  className={`fluid-press px-3 py-1.5 rounded-xl text-xs font-semibold ${
                    selectedHostel === hostel
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-900 border border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {hostel}
                </button>
              ))}
            </div>

            {/* Meals of the Day */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {(['breakfast', 'lunch', 'snacks', 'dinner'] as const).map((mealType) => {
                const meal = messMenu.find((m) => m.mealType === mealType);
                return (
                  <div
                    key={mealType}
                    className={`p-4 rounded-3xl border ${
                      meal?.isCurrentMeal
                        ? 'bg-amber-500/15 border-amber-400 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <span className="text-xs font-bold text-amber-300 uppercase">
                        {mealType}
                      </span>
                      {meal?.isCurrentMeal && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                          ACTIVE MEAL
                        </span>
                      )}
                    </div>

                    <div className="my-3 space-y-1">
                      {meal?.items.map((item, i) => (
                        <div key={i} className="text-xs text-white flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>

                    {meal?.dietaryNote && (
                      <div className="pt-2 border-t border-white/10 text-[10px] text-slate-400 italic">
                        {meal.dietaryNote}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 5: CAMPUS DIRECTORY & CLINIC */}
        {/* ==================================================================== */}
        {activeTab === 'directory' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Campus Directory & Emergency Desk</h2>
              <p className="text-xs text-slate-400">
                Key phone numbers, clinic ambulance, transport desk, and administrative offices.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {services.map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-3xl bg-slate-900 border border-white/10 flex items-start justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{s.title}</span>
                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] uppercase font-mono">
                        {s.category}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300">{s.description}</p>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 pt-1">
                      <MapPin className="w-3 h-3 text-sky-400" />
                      <span>{s.location} · {s.operatingHours}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 ml-4 flex-shrink-0">
                    <a
                      href={`tel:${s.phone}`}
                      className="fluid-press px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-xs font-bold flex items-center gap-1"
                    >
                      <Phone className="w-3 h-3" />
                      <span>{s.phone}</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 6: GROUNDED CAMPUS AI ASSISTANT (WITH CITATIONS §13) */}
        {/* ==================================================================== */}
        {activeTab === 'ai' && (
          <div className="space-y-4 max-w-3xl mx-auto">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-white">Grounded Campus AI Assistant</h2>
              </div>
              <p className="text-xs text-slate-400">
                Answers verified against official IIT Mandi Academic Calendars, Transport
                schedules, Mess rules, and Student Handbook with verifiable citations.
              </p>
            </div>

            {/* QA Conversation */}
            <div className="space-y-4">
              {qaHistory.map((turn) => (
                <div key={turn.id} className="space-y-2">
                  {/* User query */}
                  <div className="p-3 rounded-2xl bg-sky-600 text-white text-xs max-w-lg ml-auto font-medium">
                    {turn.query}
                  </div>

                  {/* Grounded AI Answer */}
                  <div className="p-4 rounded-3xl bg-slate-900 border border-sky-500/30 text-xs text-slate-200 space-y-3 mr-auto leading-relaxed">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-sky-300">Kamand Grounded AI</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-medium text-[10px]">
                        Confidence: {turn.confidence.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-slate-100">{turn.answer}</div>

                    {/* Citations List (§13) */}
                    {turn.citations.length > 0 && (
                      <div className="pt-2 border-t border-white/10 space-y-1.5">
                        <div className="text-[11px] font-semibold text-sky-300">
                          Official Sources & Citations:
                        </div>
                        {turn.citations.map((c, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-xl bg-slate-950 border border-white/10 text-[11px] space-y-0.5"
                          >
                            <div className="font-semibold text-emerald-300 flex items-center justify-between">
                              <span>📄 {c.title}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {c.reference}
                              </span>
                            </div>
                            <p className="text-slate-400 text-[10px] italic">"{c.snippet}"</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Question Input Form */}
            <form onSubmit={handleAskCampusAi} className="flex items-center gap-2 pt-2">
              <input
                type="text"
                value={qaInput}
                onChange={(e) => setQaInput(e.target.value)}
                placeholder="Ask about IIT Mandi buses, drop deadlines, mess rules, clinic…"
                aria-label="Ask about campus"
                className="flex-1 rounded-2xl bg-slate-900 border border-white/15 px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={!qaInput.trim() || isAskingQa}
                className="fluid-press px-4 py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-sky-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isAskingQa ? 'Verifying…' : 'Ask'}</span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Free Slots Sheet Modal */}
      <FluidSheet
        isOpen={isFreeSlotModalOpen}
        onClose={() => setIsFreeSlotModalOpen(false)}
        title="Find Common Free Slots for Hackathon / Group Meetings"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-300">
            Select peer contacts to compute intersecting free slots on a given day between 08:00
            and 18:00 without schedule conflicts.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">Day of the Week:</label>
            <div className="flex gap-1.5">
              {(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFreeSlotDay(d)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                    freeSlotDay === d
                      ? 'bg-sky-500 border-sky-400 text-white'
                      : 'bg-slate-900 border-white/10 text-slate-400'
                  }`}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">Select Peer Contacts:</label>
            <div className="max-h-40 overflow-y-auto space-y-1 p-2 rounded-2xl bg-slate-950 border border-white/10">
              {contacts.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-2">
                  No accepted contacts found. Add peers in Contacts first.
                </p>
              ) : (
                contacts.map((c) => {
                  const checked = selectedPeerIds.includes(c.peer.id);
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/5 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedPeerIds((prev) =>
                            prev.includes(c.peer.id)
                              ? prev.filter((id) => id !== c.peer.id)
                              : [...prev, c.peer.id]
                          );
                        }}
                        className="accent-sky-500"
                      />
                      <span className="font-medium text-white">{c.peer.displayName}</span>
                      <span className="text-slate-400">(@{c.peer.username})</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleCalculateFreeSlots()}
            className="fluid-press w-full py-2.5 rounded-xl bg-sky-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Calculate Mutual Free Slots</span>
          </button>

          {calculatedSlots.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="text-xs font-semibold text-emerald-300">
                Found {calculatedSlots.length} mutual free slot(s):
              </div>
              <div className="space-y-1.5">
                {calculatedSlots.map((slot, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-xs flex items-center justify-between"
                  >
                    <span className="font-mono font-bold text-white">
                      {slot.startTime} – {slot.endTime}
                    </span>
                    <span className="text-emerald-300 font-semibold">{slot.durationMins} mins</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </FluidSheet>

      {/* Admin Add Bus Modal */}
      {isAdmin && (
        <FluidSheet
          isOpen={isAddBusOpen}
          onClose={() => setIsAddBusOpen(false)}
          title="Admin: Schedule New Bus Trip"
        >
          <form onSubmit={handleAddBus} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Route Name</label>
              <input
                type="text"
                value={newBusRoute}
                onChange={(e) => setNewBusRoute(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">From</label>
                <input
                  type="text"
                  value={newBusFrom}
                  onChange={(e) => setNewBusFrom(e.target.value)}
                  className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">To</label>
                <input
                  type="text"
                  value={newBusTo}
                  onChange={(e) => setNewBusTo(e.target.value)}
                  className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Departure Time (HH:mm)</label>
              <input
                type="text"
                value={newBusTime}
                onChange={(e) => setNewBusTime(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-white"
              />
            </div>
            <button
              type="submit"
              className="fluid-press w-full py-2.5 rounded-xl bg-sky-500 text-white font-semibold"
            >
              Save Bus Trip
            </button>
          </form>
        </FluidSheet>
      )}

      {/* Admin Edit Mess Modal */}
      {isAdmin && (
        <FluidSheet
          isOpen={isEditMessOpen}
          onClose={() => setIsEditMessOpen(false)}
          title={`Admin: Update ${selectedHostel} Menu`}
        >
          <form onSubmit={handleUpdateMess} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Meal Type</label>
              <select
                value={editMealType}
                onChange={(e) => setEditMealType(e.target.value as typeof editMealType)}
                className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-white"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="snacks">Snacks</option>
                <option value="dinner">Dinner</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Menu Items (comma-separated)</label>
              <textarea
                rows={3}
                value={editMealItems}
                onChange={(e) => setEditMealItems(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-white"
              />
            </div>
            <button
              type="submit"
              className="fluid-press w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold"
            >
              Update Menu
            </button>
          </form>
        </FluidSheet>
      )}
    </div>
  );
};
