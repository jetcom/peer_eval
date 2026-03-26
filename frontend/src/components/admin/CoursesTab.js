import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
  RadialBarChart, RadialBar
} from 'recharts';

const EVAL_TYPE_LABELS = {
  peer: 'Peer',
  audience: 'Audience',
  self: 'Self',
  paper_review: 'Paper Review',
  phase: 'Phase'
};

const CHART_COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
const EVAL_TYPE_COLORS = {
  peer: '#3498db',
  audience: '#2ecc71',
  self: '#f39c12',
  paper_review: '#9b59b6',
  phase: '#e74c3c'
};

function ChartCard({ title, darkMode, children, span }) {
  return (
    <div style={{
      padding: '20px',
      borderRadius: '10px',
      backgroundColor: darkMode ? 'var(--bg-surface)' : 'white',
      border: `1px solid ${darkMode ? 'var(--border-color)' : '#e0e0e0'}`,
      gridColumn: span ? `span ${span}` : undefined
    }}>
      <div style={{
        fontSize: '0.9rem',
        fontWeight: 600,
        marginBottom: '16px',
        color: darkMode ? 'var(--text-heading)' : '#333'
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function CoursesTab({ darkMode }) {
  const [courses, setCourses] = useState([]);
  const [globalStats, setGlobalStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showCharts, setShowCharts] = useState(true);

  const textColor = darkMode ? '#93a1a1' : '#666';
  const gridColor = darkMode ? '#333' : '#eee';
  const tooltipBg = darkMode ? '#1a1a2e' : '#fff';
  const tooltipBorder = darkMode ? '#333' : '#ddd';

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/classes/analytics');
      setCourses(res.data.courses);
      setGlobalStats(res.data.global_stats);
    } catch (err) {
      console.error('Failed to fetch course analytics:', err);
      setError('Failed to load course data');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filtered = useMemo(() => courses
    .filter(c => showArchived || !c.archived)
    .filter(c => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        c.name.toLowerCase().includes(term) ||
        c.teacher.name.toLowerCase().includes(term) ||
        c.teacher.email.toLowerCase().includes(term) ||
        (c.semester || '').toLowerCase().includes(term) ||
        (c.section || '').toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'name': return dir * a.name.localeCompare(b.name);
        case 'instructor': return dir * a.teacher.name.localeCompare(b.teacher.name);
        case 'students': return dir * (a.student_count - b.student_count);
        case 'evals': return dir * (a.total_submissions - b.total_submissions);
        case 'semester': return dir * (a.semester || '').localeCompare(b.semester || '');
        case 'completion': return dir * (a.completion_rate - b.completion_rate);
        default: return 0;
      }
    }), [courses, showArchived, searchTerm, sortField, sortDirection]);

  // Chart data computations
  const chartData = useMemo(() => {
    if (!courses.length) return {};

    // Students per course (top 15 by student count)
    const studentsByCourse = [...courses]
      .filter(c => !c.archived)
      .sort((a, b) => b.student_count - a.student_count)
      .slice(0, 15)
      .map(c => ({
        name: c.name.length > 25 ? c.name.slice(0, 22) + '...' : c.name,
        fullName: c.name,
        students: c.student_count,
        instructor: c.teacher.name
      }));

    // Eval type distribution (pie chart)
    const evalTypeDist = globalStats?.eval_type_counts
      ? Object.entries(globalStats.eval_type_counts).map(([type, count]) => ({
          name: EVAL_TYPE_LABELS[type] || type,
          value: count,
          type
        }))
      : [];

    // Submissions per course (top 15)
    const submissionsByCourse = [...courses]
      .filter(c => c.total_submissions > 0)
      .sort((a, b) => b.total_submissions - a.total_submissions)
      .slice(0, 15)
      .map(c => ({
        name: c.name.length > 25 ? c.name.slice(0, 22) + '...' : c.name,
        fullName: c.name,
        phase: c.phase_eval_count,
        assignment: c.assignment_eval_count
      }));

    // Mode split (pie chart)
    const phaseCourses = courses.filter(c => c.evaluation_mode === 'phases' && !c.archived).length;
    const assignmentCourses = courses.filter(c => c.evaluation_mode === 'assignments' && !c.archived).length;
    const modeSplit = [
      { name: 'Phase-based', value: phaseCourses },
      { name: 'Assignment-based', value: assignmentCourses }
    ].filter(d => d.value > 0);

    // Semester trend
    const semesterMap = {};
    courses.forEach(c => {
      const sem = c.semester || 'Unknown';
      if (!semesterMap[sem]) semesterMap[sem] = { semester: sem, courses: 0, students: 0, submissions: 0 };
      semesterMap[sem].courses++;
      semesterMap[sem].students += c.student_count;
      semesterMap[sem].submissions += c.total_submissions;
    });
    const semesterTrend = Object.values(semesterMap).sort((a, b) => a.semester.localeCompare(b.semester));

    // Completion rates (radial bar chart for active courses with submissions)
    const completionData = [...courses]
      .filter(c => !c.archived && c.expected_submissions > 0)
      .sort((a, b) => a.completion_rate - b.completion_rate)
      .slice(0, 10)
      .map((c, i) => ({
        name: c.name.length > 20 ? c.name.slice(0, 17) + '...' : c.name,
        fullName: c.name,
        completion: Math.min(c.completion_rate, 100),
        fill: CHART_COLORS[i % CHART_COLORS.length]
      }));

    // Submission timeline (area chart)
    const timeline = globalStats?.submission_timeline || [];

    // Instructor workload
    const instructorMap = {};
    courses.filter(c => !c.archived).forEach(c => {
      const name = c.teacher.name;
      if (!instructorMap[name]) instructorMap[name] = { name, courses: 0, students: 0, submissions: 0 };
      instructorMap[name].courses++;
      instructorMap[name].students += c.student_count;
      instructorMap[name].submissions += c.total_submissions;
    });
    const instructorWorkload = Object.values(instructorMap)
      .sort((a, b) => b.students - a.students)
      .slice(0, 12);

    return {
      studentsByCourse,
      evalTypeDist,
      submissionsByCourse,
      modeSplit,
      semesterTrend,
      completionData,
      timeline,
      instructorWorkload
    };
  }, [courses, globalStats]);

  const totalStudents = filtered.reduce((sum, c) => sum + c.student_count, 0);
  const totalEvals = filtered.reduce((sum, c) => sum + c.total_submissions, 0);
  const activeCourses = filtered.filter(c => !c.archived).length;
  const avgCompletion = filtered.filter(c => c.expected_submissions > 0).length > 0
    ? Math.round(filtered.filter(c => c.expected_submissions > 0).reduce((s, c) => s + c.completion_rate, 0) / filtered.filter(c => c.expected_submissions > 0).length)
    : 0;

  const SortArrow = ({ field }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}> ↕</span>;
    return <span> {sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  const customTooltipStyle = {
    backgroundColor: tooltipBg,
    border: `1px solid ${tooltipBorder}`,
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '0.85rem',
    color: darkMode ? '#e0e0e0' : '#333'
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading course analytics...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <div className="error">{error}</div>
        <button className="btn btn-primary" onClick={fetchCourses} style={{ marginTop: '10px' }}>Retry</button>
      </div>
    );
  }

  return (
    <div>
      {/* Summary cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        {[
          { label: 'Total Courses', value: courses.length, color: '#3498db' },
          { label: 'Active', value: activeCourses, color: '#2ecc71' },
          { label: 'Students', value: totalStudents, color: '#9b59b6' },
          { label: 'Evaluations', value: totalEvals, color: '#e74c3c' },
          { label: 'Avg Completion', value: `${avgCompletion}%`, color: '#f39c12' }
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            padding: '14px 16px',
            borderRadius: '8px',
            backgroundColor: darkMode ? 'var(--bg-surface)' : '#f8f9fa',
            border: `1px solid ${darkMode ? 'var(--border-color)' : '#e0e0e0'}`,
            textAlign: 'center',
            borderTop: `3px solid ${color}`
          }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: '0.8rem', color: textColor, marginTop: '2px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Charts toggle */}
      <div style={{ marginBottom: '16px' }}>
        <button
          className="btn"
          onClick={() => setShowCharts(!showCharts)}
          style={{
            fontSize: '0.85rem',
            padding: '6px 14px',
            backgroundColor: darkMode ? 'var(--bg-surface)' : '#f0f0f0',
            border: `1px solid ${darkMode ? 'var(--border-color)' : '#ddd'}`,
            color: darkMode ? 'var(--text-primary)' : '#333',
            cursor: 'pointer',
            borderRadius: '6px'
          }}
        >
          {showCharts ? 'Hide Charts' : 'Show Charts'}
        </button>
      </div>

      {/* Charts grid */}
      {showCharts && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {/* Submission Timeline */}
          {chartData.timeline?.length > 0 && (
            <ChartCard title="Submission Activity Over Time" darkMode={darkMode} span={2}>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData.timeline}>
                  <defs>
                    <linearGradient id="colorSubs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3498db" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3498db" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: textColor }}
                    tickFormatter={(d) => {
                      const date = new Date(d + 'T00:00:00');
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                    interval="preserveStartEnd"
                    minTickGap={40}
                  />
                  <YAxis tick={{ fontSize: 11, fill: textColor }} />
                  <Tooltip
                    contentStyle={customTooltipStyle}
                    labelFormatter={(d) => new Date(d + 'T00:00:00').toLocaleDateString()}
                  />
                  <Area type="monotone" dataKey="count" stroke="#3498db" strokeWidth={2} fill="url(#colorSubs)" name="Submissions" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Students per course */}
          {chartData.studentsByCourse?.length > 0 && (
            <ChartCard title="Students per Course" darkMode={darkMode}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData.studentsByCourse} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: textColor }} />
                  <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11, fill: textColor }} />
                  <Tooltip
                    contentStyle={customTooltipStyle}
                    formatter={(value, name, props) => [value, 'Students']}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Bar dataKey="students" fill="#3498db" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Eval Type Distribution */}
          {chartData.evalTypeDist?.length > 0 && (
            <ChartCard title="Evaluation Type Distribution" darkMode={darkMode}>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={chartData.evalTypeDist}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: textColor }}
                  >
                    {chartData.evalTypeDist.map((entry, i) => (
                      <Cell key={i} fill={EVAL_TYPE_COLORS[entry.type] || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={customTooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Submissions per course */}
          {chartData.submissionsByCourse?.length > 0 && (
            <ChartCard title="Submissions per Course" darkMode={darkMode}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData.submissionsByCourse} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: textColor }} />
                  <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11, fill: textColor }} />
                  <Tooltip
                    contentStyle={customTooltipStyle}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Bar dataKey="phase" stackId="a" fill="#e74c3c" name="Phase" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="assignment" stackId="a" fill="#2ecc71" name="Assignment" radius={[0, 4, 4, 0]} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem', color: textColor }} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Mode split */}
          {chartData.modeSplit?.length > 0 && (
            <ChartCard title="Evaluation Mode Split" darkMode={darkMode}>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={chartData.modeSplit}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={{ stroke: textColor }}
                  >
                    <Cell fill="#3498db" />
                    <Cell fill="#2ecc71" />
                  </Pie>
                  <Tooltip contentStyle={customTooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem', color: textColor }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Semester trends */}
          {chartData.semesterTrend?.length > 1 && (
            <ChartCard title="Semester Trends" darkMode={darkMode}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData.semesterTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="semester" tick={{ fontSize: 11, fill: textColor }} />
                  <YAxis tick={{ fontSize: 11, fill: textColor }} />
                  <Tooltip contentStyle={customTooltipStyle} />
                  <Bar dataKey="courses" fill="#3498db" name="Courses" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="students" fill="#2ecc71" name="Students" radius={[4, 4, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem', color: textColor }} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Completion rates */}
          {chartData.completionData?.length > 0 && (
            <ChartCard title="Completion Rate by Course" darkMode={darkMode}>
              <ResponsiveContainer width="100%" height={300}>
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="15%"
                  outerRadius="90%"
                  data={chartData.completionData}
                  startAngle={180}
                  endAngle={0}
                >
                  <RadialBar
                    background={{ fill: darkMode ? '#222' : '#f0f0f0' }}
                    dataKey="completion"
                    label={{ position: 'insideStart', fill: '#fff', fontSize: 11, formatter: (v) => `${v}%` }}
                  />
                  <Tooltip
                    contentStyle={customTooltipStyle}
                    formatter={(value) => [`${value}%`, 'Completion']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName}
                  />
                  <Legend
                    iconSize={10}
                    layout="horizontal"
                    wrapperStyle={{ fontSize: '0.75rem', color: textColor }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Instructor workload */}
          {chartData.instructorWorkload?.length > 0 && (
            <ChartCard title="Instructor Workload (Active Courses)" darkMode={darkMode}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData.instructorWorkload} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: textColor }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: textColor }} />
                  <Tooltip contentStyle={customTooltipStyle} />
                  <Bar dataKey="courses" fill="#9b59b6" name="Courses" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="students" fill="#3498db" name="Students" radius={[0, 4, 4, 0]} />
                  <Legend wrapperStyle={{ fontSize: '0.8rem', color: textColor }} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search courses, instructors, semesters..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            minWidth: '200px',
            padding: '8px 12px',
            borderRadius: '6px',
            border: `1px solid ${darkMode ? 'var(--border-color)' : '#ddd'}`,
            backgroundColor: darkMode ? 'var(--bg-input)' : 'white',
            color: darkMode ? 'var(--text-primary)' : 'inherit'
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <span style={{ fontSize: '0.85rem', color: textColor }}>
          {filtered.length} course{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ fontSize: '0.9rem' }}>
          <thead>
            <tr>
              <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('name')}>
                Course<SortArrow field="name" />
              </th>
              <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('semester')}>
                Semester<SortArrow field="semester" />
              </th>
              <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('instructor')}>
                Instructor<SortArrow field="instructor" />
              </th>
              <th style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center' }} onClick={() => handleSort('students')}>
                Students<SortArrow field="students" />
              </th>
              <th style={{ whiteSpace: 'nowrap' }}>Mode</th>
              <th style={{ whiteSpace: 'nowrap' }}>Eval Types</th>
              <th style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center' }} onClick={() => handleSort('evals')}>
                Submissions<SortArrow field="evals" />
              </th>
              <th style={{ cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center' }} onClick={() => handleSort('completion')}>
                Completion<SortArrow field="completion" />
              </th>
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: textColor }}>
                  {searchTerm ? 'No courses match your search' : 'No courses found'}
                </td>
              </tr>
            ) : filtered.map(course => (
              <React.Fragment key={course.id}>
                <tr
                  onClick={() => setExpandedId(expandedId === course.id ? null : course.id)}
                  style={{
                    cursor: 'pointer',
                    opacity: course.archived ? 0.6 : 1,
                    backgroundColor: expandedId === course.id
                      ? (darkMode ? 'rgba(52, 152, 219, 0.1)' : 'rgba(52, 152, 219, 0.05)')
                      : undefined
                  }}
                >
                  <td>
                    <strong>{course.name}</strong>
                    {course.section && <span style={{ color: textColor }}> ({course.section})</span>}
                    {course.archived ? <span style={{ marginLeft: '8px', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '3px', backgroundColor: darkMode ? '#555' : '#ddd' }}>Archived</span> : null}
                  </td>
                  <td>{course.semester || '—'}</td>
                  <td>
                    <div>{course.teacher.name}</div>
                    <div style={{ fontSize: '0.8rem', color: textColor }}>{course.teacher.email}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>{course.student_count}</td>
                  <td>
                    <span style={{
                      fontSize: '0.8rem',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      backgroundColor: course.evaluation_mode === 'assignments'
                        ? (darkMode ? '#1a3a2a' : '#e8f5e9')
                        : (darkMode ? '#1a2a3a' : '#e3f2fd'),
                      color: course.evaluation_mode === 'assignments'
                        ? (darkMode ? '#81c784' : '#2e7d32')
                        : (darkMode ? '#64b5f6' : '#1565c0')
                    }}>
                      {course.evaluation_mode === 'assignments' ? 'Assignments' : `Phases (${course.num_phases})`}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {course.eval_types_used.length > 0 ? course.eval_types_used.map(et => (
                        <span key={et} style={{
                          fontSize: '0.75rem',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          backgroundColor: darkMode ? 'var(--bg-base)' : '#f0f0f0',
                          border: `1px solid ${darkMode ? 'var(--border-color)' : '#ddd'}`
                        }}>
                          {EVAL_TYPE_LABELS[et] || et}
                        </span>
                      )) : (
                        <span style={{ color: textColor, fontSize: '0.85rem' }}>
                          {course.evaluation_mode === 'phases' ? 'Phase-based' : '—'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>{course.total_submissions}</td>
                  <td style={{ textAlign: 'center' }}>
                    {course.expected_submissions > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <div style={{
                          width: '50px',
                          height: '6px',
                          borderRadius: '3px',
                          backgroundColor: darkMode ? '#333' : '#e0e0e0',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${Math.min(course.completion_rate, 100)}%`,
                            height: '100%',
                            borderRadius: '3px',
                            backgroundColor: course.completion_rate >= 80 ? '#2ecc71'
                              : course.completion_rate >= 50 ? '#f39c12' : '#e74c3c'
                          }} />
                        </div>
                        <span style={{ fontSize: '0.8rem' }}>{course.completion_rate}%</span>
                      </div>
                    ) : (
                      <span style={{ color: textColor, fontSize: '0.8rem' }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>
                    {expandedId === course.id ? '▲' : '▼'}
                  </td>
                </tr>
                {expandedId === course.id && (
                  <tr>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <CourseDetail course={course} darkMode={darkMode} textColor={textColor} gridColor={gridColor} tooltipStyle={customTooltipStyle} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CourseDetail({ course, darkMode, textColor, gridColor, tooltipStyle }) {
  const sectionStyle = { marginBottom: '16px' };
  const labelStyle = {
    fontWeight: 600,
    fontSize: '0.85rem',
    marginBottom: '6px',
    color: textColor
  };
  const detailBg = darkMode ? 'var(--bg-base)' : '#fafbfc';
  const borderColor = darkMode ? 'var(--border-color)' : '#e8e8e8';

  return (
    <div style={{
      padding: '20px 25px',
      backgroundColor: detailBg,
      borderTop: `1px solid ${borderColor}`,
      borderBottom: `2px solid ${borderColor}`
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        {/* Left column - Course info */}
        <div>
          <div style={sectionStyle}>
            <div style={labelStyle}>Course Details</div>
            <div style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
              <div><strong>Name:</strong> {course.name}{course.section ? ` (${course.section})` : ''}</div>
              <div><strong>Semester:</strong> {course.semester || '—'}</div>
              <div><strong>Mode:</strong> {course.evaluation_mode === 'assignments' ? 'Assignment-based' : `Phase-based (${course.num_phases} phases)`}</div>
              {course.evaluation_mode === 'phases' && (
                <div><strong>Final Evaluation:</strong> {course.has_final_evaluation ? 'Yes' : 'No'}</div>
              )}
              <div><strong>Groups:</strong> {course.show_groups ? `Yes (${course.group_count})` : 'No'}</div>
              <div><strong>Created:</strong> {new Date(course.created_at).toLocaleDateString()}</div>
              {course.expected_submissions > 0 && (
                <div><strong>Completion:</strong> {course.total_submissions} / {course.expected_submissions} ({course.completion_rate}%)</div>
              )}
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={labelStyle}>Instructor{course.co_instructors.length > 0 ? 's' : ''}</div>
            <div style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
              <div>{course.teacher.name} <span style={{ color: textColor }}>({course.teacher.email})</span></div>
              {course.co_instructors.map(ci => (
                <div key={ci.id}>{ci.name} <span style={{ color: textColor }}>({ci.email})</span></div>
              ))}
            </div>
          </div>

          {course.criteria.length > 0 && (
            <div style={sectionStyle}>
              <div style={labelStyle}>Evaluation Criteria</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {course.criteria.map((name, i) => (
                  <span key={i} style={{
                    fontSize: '0.8rem',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    backgroundColor: darkMode ? 'var(--bg-surface)' : '#eee',
                    border: `1px solid ${borderColor}`
                  }}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Middle column - Assignments & phases */}
        <div>
          {course.evaluation_mode === 'phases' && Object.keys(course.phase_due_dates).length > 0 && (
            <div style={sectionStyle}>
              <div style={labelStyle}>Phase Due Dates</div>
              <div style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
                {Object.entries(course.phase_due_dates)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([phase, date]) => (
                    <div key={phase}>
                      Phase {phase}: {date ? new Date(date).toLocaleDateString() : '—'}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {course.assignments.length > 0 && (
            <div style={sectionStyle}>
              <div style={labelStyle}>Assignments ({course.assignments.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {course.assignments.map(a => (
                  <div key={a.id} style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    backgroundColor: darkMode ? 'var(--bg-surface)' : 'white',
                    border: `1px solid ${borderColor}`,
                    fontSize: '0.85rem'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{a.name}</div>
                    {a.due_date && (
                      <div style={{ color: textColor, marginBottom: '4px' }}>
                        Due: {new Date(a.due_date).toLocaleDateString()}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {a.eval_types.map(et => (
                        <span key={et.id} style={{
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          backgroundColor: darkMode ? 'var(--bg-base)' : '#f0f0f0',
                          border: `1px solid ${borderColor}`
                        }}>
                          {EVAL_TYPE_LABELS[et.eval_type] || et.eval_type}
                          {et.target_type === 'group' ? ' (group)' : ''}
                          {' — '}
                          {et.submission_count} submission{et.submission_count !== 1 ? 's' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {course.assignments.length === 0 && course.evaluation_mode === 'phases' && (
            <div style={sectionStyle}>
              <div style={labelStyle}>Submissions</div>
              <div style={{ fontSize: '0.9rem' }}>
                {course.phase_eval_count} phase evaluation{course.phase_eval_count !== 1 ? 's' : ''} submitted
              </div>
            </div>
          )}
        </div>

        {/* Right column - Course submission timeline */}
        {course.submission_timeline?.length > 1 && (
          <div>
            <div style={sectionStyle}>
              <div style={labelStyle}>Submission Timeline</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={course.submission_timeline}>
                  <defs>
                    <linearGradient id={`grad-${course.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3498db" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3498db" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: textColor }}
                    tickFormatter={(d) => {
                      const date = new Date(d + 'T00:00:00');
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                    interval="preserveStartEnd"
                    minTickGap={30}
                  />
                  <YAxis tick={{ fontSize: 10, fill: textColor }} width={30} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(d) => new Date(d + 'T00:00:00').toLocaleDateString()}
                  />
                  <Area type="monotone" dataKey="count" stroke="#3498db" strokeWidth={2} fill={`url(#grad-${course.id})`} name="Submissions" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CoursesTab;
