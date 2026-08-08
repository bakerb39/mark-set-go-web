(() => {
  'use strict';

  const GLOBAL = {
    product: 'Mark, Set, Go!',
    purpose: 'A reading accelerator and learning workspace for reading faster, understanding more deeply, remembering more, and applying what you learn.',
    navigation: [
      'My Library contains saved reading, reading lists, notes, bookmarks, definitions, and library tools.',
      'Browse is for discovering books and sources, including DRM-free books and other reading collections.',
      'Learn contains reading-skills and study tools such as comprehension, mnemonics, language learning, courses, Great Ideas, Great Books, and Bible Study when enabled.',
      'My Notebook collects saved passages, notes, and Mark responses.',
      'Music & Focus contains focus-audio tools.',
      'Help contains the app guide and walkthroughs.',
      'Customize My Experience controls which optional feature groups appear; hiding a feature does not delete its saved data.'
    ],
    conventions: [
      'Ask Mark in this page-help mode answers only questions about using the current app page and closely related navigation.',
      'Reader-specific questions about selected text belong to the Reader\'s existing Ask Mark workflow, not this page-help panel.',
      'A feature may be hidden when it is disabled in Customize My Experience.'
    ]
  };

  const PAGES = {
    home: {
      title: 'Home',
      purpose: 'Launch reading quickly, continue a saved reading session, or measure natural reading speed.',
      sections: ['Meet Mark reading-companion card', 'Ready to read launch panel'],
      controls: {
        'Open Reader': 'Opens the main Reader without automatically loading a new document.',
        'WPM Test': 'Starts the reading-speed test.',
        'Continue Reading': 'Restores the most recently saved resumable reading session when one exists.',
        'Clear Resume Position': 'Removes the saved resume checkpoint for the current resumable session.'
      },
      workflows: ['To resume a book, use Continue Reading when available.', 'To start from scratch, choose Open Reader and then import/open reading.', 'To establish a baseline speed, run the WPM Test.'],
      troubleshooting: ['If Continue Reading is disabled, no resumable session is currently stored.', 'If a saved session can no longer be restored, reopen the book from Library or Reading Progress.']
    },
    'profile-preferences': {
      title: 'Customize My Experience',
      purpose: 'Control which optional tools appear across the app without deleting their saved data.',
      sections: ['Choose an experience preset', 'Choose what appears', 'Personalized coaching'],
      controls: {
        'Experience presets': 'Apply a preconfigured combination of visible features.',
        'Feature switches': 'Show or hide Learn, Music & Focus, Reading Goals, Action Center, Modern Guides, Great Books, Bible Study, Language Learning, Mnemonics, Courses & Learning Modules, and Advanced Reader Tools.'
      },
      workflows: ['Choose a preset for quick setup, then fine-tune individual feature switches.', 'Turn a feature back on here if its navigation item is missing.'],
      troubleshooting: ['Hidden features are not deleted.', 'If browser storage is full, a preference may apply only for the current session.']
    },
    'my-library': {
      title: 'My Library',
      purpose: 'Central hub for saved books, current reading, collections, and reading-management tools.',
      sections: ['Continue/current reading', 'Saved books and editions', 'Collections', 'Library tools', 'Insights & Action links'],
      controls: {
        'Open/Continue': 'Opens a saved book or resumes its reading position when available.',
        'My Reading': 'Opens the reading-list/status view.',
        'Bookmarks': 'Shows saved bookmarks.',
        'Notes': 'Shows notes associated with reading.',
        'Definitions': 'Opens saved vocabulary definitions.',
        'Browse': 'Finds additional books and sources.',
        'Read Anything': 'Imports a webpage, document, book, or pasted text.'
      },
      workflows: ['Use this page as the main starting point for returning to saved reading.', 'Use collections to review bookmarks, notes, and definitions without opening each book first.'],
      troubleshooting: ['A book may need to be re-imported if its cloud/local content is unavailable even though metadata remains.', 'Resume behavior depends on a saved reading checkpoint for that document.']
    },
    'my-reading': {
      title: 'My Reading',
      purpose: 'Manage books being read, their status, progress, and saved editions.',
      sections: ['Reading list', 'Statuses and progress', 'Saved editions'],
      controls: {'Resume/Open': 'Returns to a book in the Reader.', 'Status controls': 'Update how a book is categorized in your reading workflow.'},
      workflows: ['Use My Reading to manage what you are actively reading rather than browsing the entire library.'],
      troubleshooting: ['If an edition cannot open, the underlying stored document may no longer be available locally or in cloud storage.']
    },
    browse: {
      title: 'Browse',
      purpose: 'Choose a source or discovery path for finding something to read.',
      sections: ['DRM-Free Books', 'Great Books', 'Bible Study', 'Project Gutenberg or library sources', 'Read Anything/import options'],
      controls: {'DRM-Free Books': 'Searches sources that provide DRM-free or openly accessible editions.', 'Read Anything': 'Imports your own text, file, or supported webpage.'},
      workflows: ['Choose a specialized collection when you know the kind of material you want.', 'Use Read Anything when you already have the content or URL.'],
      troubleshooting: ['Availability and download formats depend on the external source.']
    },
    'drm-free': {
      title: 'DRM-Free Books',
      purpose: 'Search and filter DRM-free/open book sources using more than an exact title search.',
      sections: ['Search', 'Category and metadata filters', 'Results and source links'],
      controls: {'Search': 'Search by title, author, subject, or keyword.', 'Filters': 'Narrow results by category, rights, format, source, language, and year when supported.', 'Open/Download': 'Uses the selected source or edition link.'},
      workflows: ['Start broad with author/title/subject, then narrow with filters.', 'Check the rights/source details before assuming a commercial title is DRM-free.'],
      troubleshooting: ['A book being sold digitally does not necessarily mean it is DRM-free.', 'Search coverage depends on the catalog/source data available to the app.']
    },
    'read-anything': {
      title: 'Read Anything',
      purpose: 'Bring external reading into Mark, Set, Go! from files, URLs, or pasted text.',
      sections: ['File/document import', 'Web/URL import', 'Pasted text', 'Formatting/cleanup options where available'],
      controls: {'Upload/import': 'Loads supported local document formats.', 'URL': 'Attempts to extract readable text from a supported webpage.', 'Paste text': 'Creates reading content from text you provide directly.'},
      workflows: ['Choose the import method that matches your source, review the title/metadata, then open it in the Reader.'],
      troubleshooting: ['DRM-protected ebooks cannot be imported through the normal document pipeline.', 'Some websites block automated text extraction.']
    },
    'mark-notebook': {
      title: 'My Notebook',
      purpose: 'Review material you deliberately saved while reading, including passages, notes, and Mark-generated material.',
      sections: ['Saved notebook entries', 'Source/book context', 'Entry actions/export when available'],
      controls: {'Saved entry': 'Displays stored notebook content and associated reading context.', 'Return/open source': 'Returns to related reading when the entry retains a source location.', 'Export': 'Exports notebook content when offered by the current notebook view.'},
      workflows: ['Use the Notebook to revisit ideas collected across different books rather than searching each book separately.'],
      troubleshooting: ['An entry can remain even if its original source document is no longer available; returning to source then may not work.']
    },
    'library-notes': {
      title: 'Reading Notes',
      purpose: 'Review notes associated with books or reading passages.',
      sections: ['Saved notes', 'Book/source information'],
      controls: {'Open source': 'Returns to the related book/location when that source is available.'},
      workflows: ['Use this collection for book-related notes; use Random Notes for ideas unrelated to a specific reading.']
    },
    'random-notes': {
      title: 'Random Notes',
      purpose: 'Capture general notes that are not tied to a particular book.',
      sections: ['New note editor', 'Dated saved notes'],
      controls: {'New note': 'Creates a general note.', 'Save': 'Stores the note using the app\'s productivity/cloud storage path when configured.'},
      workflows: ['Use Random Notes for ideas, reminders, or thoughts that do not belong to one reading source.']
    },
    'vocabulary-builder': {
      title: 'Vocabulary Builder',
      purpose: 'Review definitions and vocabulary saved from reading.',
      sections: ['Saved words/definitions', 'Source context where available'],
      controls: {'Open source': 'Returns to the word\'s reading context when a source location is stored.'},
      workflows: ['Save useful definitions while reading, then review them here as a study list.'],
      troubleshooting: ['Definitions saved without a durable source location may not support return-to-reading navigation.']
    },
    'progress-awards': {
      title: 'Progress & Awards',
      purpose: 'Review reading activity, speed/comprehension trends, streaks, goals, and achievements.',
      sections: ['Reading progress', 'WPM/comprehension measures', 'Streaks/awards', 'Book-level progress'],
      controls: {'Book/progress links': 'Open detailed progress or return to reading when available.'},
      workflows: ['Use this page to see change over time rather than to edit a book.', 'Pair it with Reading Goals when you want a deadline or target.'],
      troubleshooting: ['Metrics only reflect reading/activity that the app has successfully recorded.']
    },
    'reading-goals': {
      title: 'Reading Goals',
      purpose: 'Set and monitor reading targets such as finishing a book by a date or improving reading performance.',
      sections: ['Goal setup', 'Book target', 'Deadline/target metrics', 'Progress and encouragement'],
      controls: {'Create/update goal': 'Stores the target for the selected book.', 'Progress': 'Shows progress against the saved target.'},
      workflows: ['Choose a book, set a realistic deadline/target, then use progress updates while reading.'],
      troubleshooting: ['Goal progress depends on the same book/document identity being used when reading.']
    },
    'action-center': {
      title: 'Action Center',
      purpose: 'Turn reading insights and personal follow-ups into actions, reminders, or next steps.',
      sections: ['Actions/tasks', 'Reminder or follow-up controls where enabled', 'Reading-related next steps'],
      controls: {'Add/action controls': 'Create or update a follow-up item.', 'Complete/remove': 'Manage an existing action.'},
      workflows: ['Use this page when something you read should become a concrete next action rather than only a note.']
    },
    'reading-skills': {
      title: 'Reading Skills',
      purpose: 'Learning hub for comprehension practice and optional study tools based on your books.',
      sections: ['Comprehension', 'Mnemonics', 'Language Learning', 'Courses & Learning Modules', 'Related learning tools'],
      controls: {'Tool cards/buttons': 'Open the selected learning tool.'},
      workflows: ['Choose a tool based on the skill you want to practice; many tools use books already in your library.'],
      troubleshooting: ['A learning tool can be hidden if it is disabled in Customize My Experience.']
    },
    'comprehension-library': {
      title: 'Comprehension',
      purpose: 'Practice and review comprehension using reading already in your library.',
      sections: ['Books eligible for practice', 'Quiz/results history'],
      controls: {'Start quiz/practice': 'Creates comprehension practice from the selected reading.'},
      workflows: ['Choose a book with sufficient readable text, complete the questions, then review results.']
    },
    mnemonics: {
      title: 'Mnemonics',
      purpose: 'Generate memory aids from a book or reading segment.',
      sections: ['Book selector', 'What should I remember?', 'Mnemonic style', 'Generated memory plan'],
      controls: {'Book': 'Chooses the reading source.', 'What should I remember?': 'Optionally focuses the memory aids on characters, arguments, timelines, concepts, or another topic.', 'Mnemonic style': 'Chooses mixed, acronym/acrostic, memory story, visual associations, or memory palace.', 'Create mnemonics': 'Generates the memory aids.'},
      workflows: ['Select a book, optionally enter a focus, choose a style, then create mnemonics.'],
      troubleshooting: ['The selected book must have accessible text in the app.']
    },
    'language-learning': {
      title: 'Language Learning',
      purpose: 'Use familiar reading as source material for vocabulary, translation, and comprehension practice in another language.',
      sections: ['Book', 'Language', 'Level', 'Generated lesson'],
      controls: {'Language': 'Choose Spanish, French, German, Italian, Portuguese, Latin, Ancient Greek, or Modern Greek.', 'Level': 'Choose beginner, intermediate, or advanced.', 'Create lesson': 'Builds a lesson from the selected book.'},
      workflows: ['Select a familiar book, choose the target language and level, then create the lesson.'],
      troubleshooting: ['The selected book must have accessible text in the app.']
    },
    'learning-courses': {
      title: 'Courses & Learning Modules',
      purpose: 'Find or organize external learning resources related to books and topics you are studying.',
      sections: ['Book/topic selection', 'Learning resource links/results'],
      controls: {'Resource links': 'Open external learning sources such as supported video/course platforms.'},
      workflows: ['Use a book or subject as the starting point, then choose an external resource that fits your learning goal.']
    },
    syntopicon: {
      title: 'Great Ideas / Syntopicon',
      purpose: 'Explore an idea across multiple works and compare how different authors treat the same concept.',
      sections: ['Idea/topic input', 'Cross-book analysis/results'],
      controls: {'Analyze/search': 'Builds a cross-text view of the selected idea using available texts.'},
      workflows: ['Choose a concept, select or use available works, then compare passages/arguments across sources.']
    },
    'bible-study': {
      title: 'Bible Study',
      purpose: 'Read and study biblical books/passages with the app\'s Bible-focused tools.',
      sections: ['Bible/book selection', 'Reading/study controls', 'Commentary or study tools where available'],
      workflows: ['Choose the biblical text/book first, then use the study tools available for that selection.'],
      troubleshooting: ['Available translations/content depend on what the app is licensed or configured to provide.']
    },
    'great-books': {
      title: 'Great Books',
      purpose: 'Browse and open primary texts from the Great Books-oriented collection.',
      sections: ['Authors/works', 'Available library/source editions'],
      controls: {'Open/read': 'Loads an available full-text edition into the reading workflow.'},
      workflows: ['Choose a work, select an available source/edition, and open it for reading or related study tools.'],
      troubleshooting: ['Not every listed classic necessarily has the same source or format availability.']
    },
    music: {
      title: 'Music & Focus',
      purpose: 'Choose focus music or supported embedded playback to accompany reading/study.',
      sections: ['Music source', 'Saved/preferred selections', 'Playback controls'],
      controls: {'YouTube/Spotify selections': 'Open supported embedded or linked playback.', 'Saved music': 'Reuse a preferred selection with reading.'},
      workflows: ['Choose a source/selection, start playback, then return to reading while the music dock remains available where supported.']
    },
    'my-links': {
      title: 'My Links',
      purpose: 'Save and organize useful external links for later reference.',
      sections: ['Saved links', 'Add/edit link controls'],
      controls: {'Add link': 'Stores a new external link.', 'Open': 'Opens the saved destination.', 'Edit/delete': 'Updates or removes a saved link when offered.'}
    },
    help: {
      title: 'Help',
      purpose: 'Learn how the app works and launch guided walkthroughs.',
      sections: ['Help topics', 'Simple Overview', 'Full Experience walkthrough', 'Troubleshooting'],
      controls: {'Simple Overview': 'Runs a shorter guided introduction.', 'Full Experience': 'Runs the more complete walkthrough.'},
      workflows: ['Use Help when you want broader guidance than the page-specific Ask Mark panel provides.']
    },
    about: {title:'About', purpose:'Explains what Mark, Set, Go! is and the goals of the application.', sections:['Product description and background'], controls:{}, workflows:[]},
    contact: {title:'Contact & Support', purpose:'Provides the app\'s contact/support information.', sections:['Contact/support details'], controls:{}, workflows:[]},
    privacy: {title:'Privacy', purpose:'Explains privacy and data-handling practices presented by the app.', sections:['Privacy information'], controls:{}, workflows:[]},
    terms: {title:'Terms', purpose:'Displays the application terms and conditions.', sections:['Terms of use'], controls:{}, workflows:[]},
    default: {
      title: 'Current page',
      purpose: 'Use the controls and navigation available on this page.',
      sections: ['Current page controls'],
      controls: {},
      workflows: ['Use the top navigation to move to Library, Browse, Learn, Notebook, Music, Help, and other enabled features.'],
      troubleshooting: ['If a feature is missing, check Customize My Experience to see whether it is hidden.']
    }
  };

  window.MarkSetGoPageHelpKnowledge = Object.freeze({ version: '2.0.0', global: GLOBAL, pages: PAGES });
})();
