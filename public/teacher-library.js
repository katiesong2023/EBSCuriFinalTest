(() => {
  'use strict';
  const unfiledId = '__unfiled__';
  function sources(library, shelf) {
    return [...library.folders, { id: unfiledId, title: '폴더 미지정', isUnfiled: true, items: shelf.map(resource => ({ resource, note: resource.personalLibraryNote ?? resource.note ?? '' })) }];
  }
  function groups(rows, query = '') {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean), grouped = new Map();
    for (const { owner, entry, index } of rows) {
      const item = entry.resource;
      const key = JSON.stringify([item.id, item.title, item.variant || '']);
      if (!grouped.has(key)) grouped.set(key, { key, resource: item, records: [] });
      grouped.get(key).records.push({ owner, entry, index });
    }
    return [...grouped.values()].filter(group => !terms.length || group.records.some(({ owner, entry }) => {
      const text = [owner.title, owner.topic, owner.targetGrade, ...(owner.curriculumStandards || []).flatMap(s => [s.id, s.text]), entry.resource.title, entry.resource.program,
        ...(entry.resource.contentPreview?.keywords || []), entry.note, ...(entry.resource.personalCurriculumStandards || []).flatMap(s => [s.id, s.text]), ...(entry.resource.selectionContexts || []).flatMap(c => [c.standardId, c.standardText, c.lessonGoal, c.usePart, c.additionalContent, c.decisionReason])].join(' ').toLocaleLowerCase();
      return terms.every(term => text.includes(term));
    }));
  }
  CuriTeacher.libraryView = { sources, groups, unfiledId };
})();
