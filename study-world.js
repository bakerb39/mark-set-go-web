(()=>{
'use strict';
const mobile=()=>matchMedia('(max-width:900px)').matches;
const avatar='/assets/ask-mark/ask-mark-avatar.png';
const books=[
 {title:'The Republic',author:'Plato',progress:46,action:'reader'},
 {title:'Crime and Punishment',author:'Fyodor Dostoevsky',progress:18,action:'reader'},
 {title:'The Federalist Papers',author:'Hamilton, Madison & Jay',progress:9,action:'reader'},
 {title:'Meditations',author:'Marcus Aurelius',progress:0,read:'great-books'}
];
const roomData={
 study:{title:"Mark's Study",sub:'Your starting place for reading, conversation, and discovery.',actions:[['Continue reading','reader'],['Ask Mark about your current book','ai-center'],['Open today’s reading plan','my-reading']]},
 library:{title:"Mark's Library",sub:'Your books, the Great Books, curated shelves, and recommendations.',books},
 journal:{title:'The Writing Desk',sub:'Notes, quotations, reflections, research, and ideas.',actions:[['Open Reading Notes','library-notes'],['Open Mark’s Notebook','mark-notebook'],['Vocabulary Builder','vocabulary-builder'],['Random Notes','library-notes']]},
 academy:{title:'The Academy',sub:'Structured study, comprehension, Great Books, and faith.',actions:[['Great Books','read:great-books'],['Bible Study','read:bible'],['Syntopicon','read:syntopicon'],['Progress & Awards','progress-awards']]},
 research:{title:'The Research Room',sub:'Compare ideas, build timelines, investigate context, and connect books.',actions:[['Open AI Research Center','ai-center'],['Browse Topics','browse'],['Ask Mark','ai-center']]},
 music:{title:'The Music Room',sub:'Choose the atmosphere for reading and reflection.',actions:[['Open Music & Focus','music'],['Return to Reading','reader']]},
 achievements:{title:'Hall of Achievements',sub:'Reading streaks, comprehension, goals, and milestones.',actions:[['View Progress & Awards','progress-awards'],['My Reading','my-reading']]}
};
function shelfRows(){return Array.from({length:4},()=>`<div class="ms-shelf-row">${Array.from({length:9},(_,i)=>`<span class="ms-book" style="--r:${i%5===0?-4:i%4===0?3:0}deg"></span>`).join('')}</div>`).join('')}
function build(){
 const el=document.createElement('section'); el.id='marks-study-world'; el.setAttribute('aria-label',"Mark's Study immersive desktop home");
 el.innerHTML=`<div class="ms-world-scene">
 <div class="ms-window" aria-hidden="true"></div><div class="ms-shelf left">${shelfRows()}</div><div class="ms-shelf right">${shelfRows()}</div><div class="ms-fireplace" aria-hidden="true"></div>
 <div class="ms-welcome"><h1>Welcome to Mark’s Study</h1><p id="msGreeting">A private library for reading, thinking, and discovery.</p></div>
 <div class="ms-mark" id="msMark"><img src="${avatar}" alt="Mark, your reading companion"></div><div class="ms-desk"><div class="ms-desk-book"></div></div>
 <nav class="ms-world-nav" aria-label="Rooms in Mark's Study">
 ${[['study','⌂ The Study'],['library','▥ Mark’s Library'],['journal','✎ Writing Desk'],['academy','◆ The Academy'],['research','⌕ Research Room'],['music','♫ Music Room'],['achievements','★ Achievements']].map(([k,l])=>`<button type="button" data-room="${k}">${l}</button>`).join('')}
 </nav>
 <div class="ms-world-controls"><button type="button" id="msClassic">Simple view</button><button type="button" id="msEnterReader">Open Reader</button></div>
 <aside class="ms-room-panel" id="msRoom"></aside><div class="ms-toast" id="msToast" role="status"></div>
 <div class="ms-mode-choice"><button class="active" type="button" id="msImmersive">Immersive Study</button><button type="button" id="msSimple">Simple App</button></div>
 </div>`;
 document.body.appendChild(el);
 return el;
}
function findAction(action){
 if(action.startsWith('read:')) return document.querySelector(`[data-read="${CSS.escape(action.slice(5))}"]`);
 return document.querySelector(`[data-action="${CSS.escape(action)}"]`);
}
function go(action){
 const target=findAction(action); close(); if(target){setTimeout(()=>target.click(),80)} else toast('This room is ready for its full connection in the next pass.');
}
function renderRoom(key){
 const d=roomData[key]||roomData.study, panel=document.getElementById('msRoom');
 let content=`<h2>${d.title}</h2><p class="sub">${d.sub}</p>`;
 if(d.books){content+=`<div class="ms-book-list">${d.books.map((b,i)=>`<button type="button" class="ms-book-card" data-go="${b.read||b.action}"><span class="ms-cover">${i+1}</span><span><strong>${b.title}</strong><small>${b.author}</small><span class="ms-progress"><span style="width:${b.progress}%"></span></span></span></button>`).join('')}</div><div class="ms-room-actions" style="margin-top:12px"><button data-go="my-library">Open complete personal shelf</button><button data-go="read:great-books">Explore the Great Books</button><button data-go="read:upload">Place a new book on your shelf</button></div>`}
 else content+=`<div class="ms-room-actions">${d.actions.map(([label,a])=>`<button type="button" data-go="${a}">${label}</button>`).join('')}</div>`;
 panel.innerHTML=content; panel.hidden=false; panel.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
 document.getElementById('msMark').classList.add('is-greeting'); setTimeout(()=>document.getElementById('msMark')?.classList.remove('is-greeting'),700);
}
function greeting(){const h=new Date().getHours();return `${h<12?'Good morning':h<17?'Good afternoon':'Good evening'}, Brian. What would you like to explore?`}
function open(){if(mobile())return; document.body.classList.add('ms-study-active'); document.body.style.overflow='hidden'; document.getElementById('msGreeting').textContent=greeting(); renderRoom('study')}
function close(){document.body.classList.remove('ms-study-active');document.body.style.overflow=''}
function toast(msg){const t=document.getElementById('msToast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}
function wire(){
 const world=build();
 world.querySelectorAll('[data-room]').forEach(b=>b.addEventListener('click',()=>renderRoom(b.dataset.room)));
 world.querySelector('#msClassic').addEventListener('click',close); world.querySelector('#msSimple').addEventListener('click',close); world.querySelector('#msEnterReader').addEventListener('click',()=>go('reader')); world.querySelector('#msImmersive').addEventListener('click',open);
 document.querySelectorAll('[data-action="home"],[data-action="my-library"]').forEach(btn=>btn.addEventListener('click',e=>{if(!mobile()){e.preventDefault();e.stopImmediatePropagation();open()}},true));
 const brand=document.querySelector('.brand'); if(brand)brand.addEventListener('click',e=>{if(!mobile()){e.preventDefault();e.stopImmediatePropagation();open()}},true);
 const libSummary=[...document.querySelectorAll('summary')].find(x=>/My Library/i.test(x.textContent||'')); if(libSummary)libSummary.innerHTML='<span class="nav-icon" aria-hidden="true">⌂</span> Mark\'s Study';
 const entry=document.createElement('button'); entry.type='button'; entry.className='ms-desktop-study-entry'; entry.textContent='Enter Mark’s Study'; entry.style.cssText='position:fixed;right:18px;bottom:18px;z-index:4500;border:1px solid #d5aa55;background:#0c2942;color:#f6e7c8;border-radius:999px;padding:11px 16px;font:600 14px system-ui;box-shadow:0 10px 28px rgba(0,0,0,.25)'; entry.addEventListener('click',open); document.body.appendChild(entry);
 setTimeout(open,350);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();
