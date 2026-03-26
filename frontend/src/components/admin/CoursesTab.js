import React, { useState, useEffect } from 'react';
import axios from 'axios';

const EVAL_TYPE_LABELS = {
  peer: 'Peer',
  audience: 'Audience',
  self: 'Self',
  paper_review: 'Paper Review'
};

function CoursesTab({ darkMode }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/classes/analytics');
      setCourses(res.data);
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

  const filtered = courses
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
        case 'evals': return dir * ((a.phase_eval_count + a.assignment_eval_count) - (b.phase_eval_count + b.assignment_eval_count));
        case 'semester': return dir * (a.semester || '').localeCompare(b.semester || '');
        default: return 0;
      }
    });

  const totalStudents = filtered.reduce((sum, c) => sum + c.student_count, 0);
  const totalEvals = filtered.reduce((sum, c) => sum + c.phase_eval_count + c.assignment_eval_count, 0);
  const activeCourses = filtered.filter(c => !c.archived).length;

  const SortArrow = ({ field }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}> ↕</span>;
    return <span> {sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading course data...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <div className="error">{error}</div>
        <button className="btn btn-primary" onClick={fetchCourses} style={{ marginTop: '10px' }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Summary cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '15px',
        marginBottom: '20px'
      }}>
        {[
          { label: 'Total Courses', value: courses.length },
          { label: 'Active Courses', value: activeCourses },
          { label: 'Total Students', value: totalStudents },
          { label: 'Total Evaluations', value: totalEvals }
        ].map(({ label, value }) => (
          <div key={label} style={{
            padding: '15px 20px',
            borderRadius: '8px',
            backgroundColor: darkMode ? 'var(--bg-surface)' : '#f8f9fa',
            border: `1px solid ${darkMode ? 'var(--border-color)' : '#e0e0e0'}`,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: '0.85rem', color: darkMode ? '#93a1a1' : '#666', marginTop: '4px' }}>{label}</div>
          </div>
        ))}
      </div>

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
        <span style={{ fontSize: '0.85rem', color: darkMode ? '#93a1a1' : '#888' }}>
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
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: darkMode ? '#93a1a1' : '#888' }}>
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
                    {course.section && <span style={{ color: darkMode ? '#93a1a1' : '#888' }}> ({course.section})</span>}
                    {course.archived ? <span style={{ marginLeft: '8px', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '3px', backgroundColor: darkMode ? '#555' : '#ddd' }}>Archived</span> : null}
                  </td>
                  <td>{course.semester || '—'}</td>
                  <td>
                    <div>{course.teacher.name}</div>
                    <div style={{ fontSize: '0.8rem', color: darkMode ? '#93a1a1' : '#888' }}>{course.teacher.email}</div>
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
                        <span style={{ color: darkMode ? '#93a1a1' : '#888', fontSize: '0.85rem' }}>
                          {course.evaluation_mode === 'phases' ? 'Phase-based' : '—'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {course.phase_eval_count + course.assignment_eval_count}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>
                    {expandedId === course.id ? '▲' : '▼'}
                  </td>
                </tr>
                {expandedId === course.id && (
                  <tr>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <CourseDetail course={course} darkMode={darkMode} />
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

function CourseDetail({ course, darkMode }) {
  const sectionStyle = {
    marginBottom: '16px'
  };
  const labelStyle = {
    fontWeight: 600,
    fontSize: '0.85rem',
    marginBottom: '6px',
    color: darkMode ? '#93a1a1' : '#555'
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
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={labelStyle}>Instructor{course.co_instructors.length > 0 ? 's' : ''}</div>
            <div style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
              <div>{course.teacher.name} <span style={{ color: darkMode ? '#93a1a1' : '#888' }}>({course.teacher.email})</span></div>
              {course.co_instructors.map(ci => (
                <div key={ci.id}>{ci.name} <span style={{ color: darkMode ? '#93a1a1' : '#888' }}>({ci.email})</span></div>
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

        {/* Right column - Assignments & stats */}
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
                      <div style={{ color: darkMode ? '#93a1a1' : '#888', marginBottom: '4px' }}>
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
      </div>
    </div>
  );
}

export default CoursesTab;
