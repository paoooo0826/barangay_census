import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BellRing, CheckCircle2, ImagePlus, Loader2, Megaphone, Plus, Send, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import SortControls from './SortControls';
import { readAllRows } from '../lib/pagination';
import { compareValues, type SortDirection } from '../lib/sorting';
import type { Announcement, AnnouncementAudience, AnnouncementPriority } from '../types/database';

interface Props { adminProfileId?: string; refreshKey?: number; }
type AnnouncementView = Announcement & { imageUrl?: string | null };
const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = { all: 'All residents', pending_review: 'Pending review residents', verified: 'Verified residents', returned: 'Residents with returned records', rejected: 'Residents with rejected records' };
const PRIORITY_LABELS: Record<AnnouncementPriority, string> = { info: 'Information', important: 'Important', urgent: 'Urgent' };
const PRIORITY_STYLES: Record<AnnouncementPriority, string> = { info: 'border-blue-200 bg-blue-50 text-blue-800', important: 'border-amber-200 bg-amber-50 text-amber-800', urgent: 'border-red-200 bg-red-50 text-red-800' };
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-PH', { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }).format(date); }

export default function AdminAnnouncements({ adminProfileId, refreshKey }: Props) {
  const [announcements, setAnnouncements] = useState<AnnouncementView[]>([]);
  const [title, setTitle] = useState(''); const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('info'); const [audience, setAudience] = useState<AnnouncementAudience>('all'); const [expiresAt, setExpiresAt] = useState('');
  const [image, setImage] = useState<File | null>(null); const [imagePreview, setImagePreview] = useState('');
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [showForm, setShowForm] = useState(false);
  const [sortField, setSortField] = useState('created_at'); const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); const [error, setError] = useState<string | null>(null); const [success, setSuccess] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date().getTime());

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await readAllRows<Announcement>((from, to) => supabase.from('announcements').select('*').order('created_at',{ascending:false}).order('id',{ascending:true}).range(from,to));
      const withImages = await Promise.all(rows.map(async (row) => {
        if (!row.image_path) return { ...row, imageUrl: null };
        const { data, error: imageError } = await supabase.storage.from('announcement-images').createSignedUrl(row.image_path, 60 * 60);
        if (imageError) throw imageError;
        return { ...row, imageUrl: data.signedUrl };
      }));
      setAnnouncements(withImages); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load announcements.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadAnnouncements(); }, [loadAnnouncements, refreshKey]);
  useEffect(() => { const timer=window.setInterval(()=>void loadAnnouncements(),50*60*1000); return()=>window.clearInterval(timer); }, [loadAnnouncements]);
  useEffect(() => { const timer=window.setInterval(()=>setCurrentTime(new Date().getTime()),60*1000); return()=>window.clearInterval(timer); }, []);
  useEffect(() => () => { if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  const sorted = useMemo(() => [...announcements].sort((a,b) => {
    const value = (x: Announcement) => sortField === 'title' ? x.title : sortField === 'priority' ? PRIORITY_LABELS[x.priority] : sortField === 'audience' ? AUDIENCE_LABELS[x.audience] : x.created_at;
    return compareValues(value(a),value(b),sortDirection) || compareValues(a.id,b.id);
  }), [announcements,sortField,sortDirection]);

  const chooseImage = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { setError('Announcement photo must be JPG, PNG, or WebP.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Announcement photo must be 5 MB or smaller.'); return; }
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImage(file); setImagePreview(URL.createObjectURL(file)); setError(null);
  };
  const clearImage = () => { if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview); setImage(null); setImagePreview(''); };

  async function handlePublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSuccess(null);
    if (title.trim().length < 3 || message.trim().length < 5) { setError('Enter a title and complete announcement message.'); return; }
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) { setError('Expiration must be a future date and time.'); return; }
    const announcementId=crypto.randomUUID();
    setSaving(true); let uploadedPath: string | null = null;
    try {
      if (image) {
        const extension = image.name.split('.').pop()?.toLowerCase() || 'jpg';
        uploadedPath = `${adminProfileId ?? 'admin'}/${announcementId}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('announcement-images').upload(uploadedPath, image, { contentType: image.type, cacheControl:'3600', upsert:false });
        if (uploadError) throw uploadError;
      }
      const { error: publishError } = await supabase.from('announcements').insert({ id:announcementId, title:title.trim(), message:message.trim(), priority, audience, is_published:true, published_at:new Date().toISOString(), expires_at:expiresAt ? new Date(expiresAt).toISOString() : null, created_by:adminProfileId ?? null, image_path:uploadedPath });
      if (publishError) {
        const { data:confirmed }=await supabase.from('announcements').select('id').eq('id',announcementId).maybeSingle();
        if (!confirmed) throw publishError;
      }
      setTitle(''); setMessage(''); setPriority('info'); setAudience('all'); setExpiresAt(''); clearImage(); setShowForm(false); setSuccess('Announcement published successfully.'); await loadAnnouncements();
    } catch (e) {
      if (uploadedPath) await supabase.storage.from('announcement-images').remove([uploadedPath]);
      setError(e instanceof Error ? e.message : 'Announcement could not be published.');
    } finally { setSaving(false); }
  }

  async function togglePublished(a: AnnouncementView) {
    const next = !a.is_published; setError(null);
    const expired=Boolean(a.expires_at&&new Date(a.expires_at).getTime()<=new Date().getTime());
    const { error: updateError } = await supabase.from('announcements').update({ is_published:next, published_at:next ? new Date().toISOString() : a.published_at, expires_at:next&&expired?null:a.expires_at, updated_at:new Date().toISOString() }).eq('id',a.id);
    if (updateError) setError(updateError.message); else { setSuccess(next ? expired?'Announcement published again and its expired date was cleared.':'Announcement published again.' : 'Announcement hidden.'); await loadAnnouncements(); }
  }
  async function deleteAnnouncement(a: AnnouncementView) {
    if (!window.confirm(`Delete “${a.title}”?`)) return;
    const { error: deleteError } = await supabase.from('announcements').delete().eq('id',a.id);
    if (deleteError) { setError(deleteError.message); return; }
    if (a.image_path) await supabase.storage.from('announcement-images').remove([a.image_path]);
    setSuccess('Announcement deleted.'); await loadAnnouncements();
  }

  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 bg-gradient-to-r from-blue-700 to-indigo-700 p-6 text-white"><div className="flex items-start gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><Megaphone size={24}/></div><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">Resident communication</p><h2 className="mt-1 text-2xl font-bold">Announcements</h2><p className="mt-2 text-sm text-blue-100">Publish text notices with an optional photo.</p></div></div><button type="button" onClick={() => setShowForm((v)=>!v)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-blue-800">{showForm ? <X size={16}/> : <Plus size={16}/>} {showForm ? 'Close form' : 'Add Announcement'}</button></div>
    {error && <div className="m-6 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={17}/>{error}</div>}{success && <div className="m-6 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 size={17}/>{success}</div>}
    <div className={`grid ${showForm ? 'xl:grid-cols-[0.9fr_1.1fr]' : ''}`}>
      {showForm && <form onSubmit={handlePublish} className="border-b border-slate-200 p-6 xl:border-b-0 xl:border-r"><h3 className="font-bold text-slate-900">Create announcement</h3><div className="mt-5 space-y-4"><label className="block text-sm font-semibold text-slate-700">Title<input value={title} onChange={(e)=>setTitle(e.target.value)} maxLength={120} className="input mt-2" required/></label><label className="block text-sm font-semibold text-slate-700">Message<textarea value={message} onChange={(e)=>setMessage(e.target.value)} maxLength={2000} rows={6} className="input mt-2 min-h-32 resize-y" required/></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Priority<select value={priority} onChange={(e)=>setPriority(e.target.value as AnnouncementPriority)} className="input mt-2">{Object.entries(PRIORITY_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">Audience<select value={audience} onChange={(e)=>setAudience(e.target.value as AnnouncementAudience)} className="input mt-2">{Object.entries(AUDIENCE_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div><label className="block text-sm font-semibold text-slate-700">Expiration (optional)<input type="datetime-local" value={expiresAt} onChange={(e)=>setExpiresAt(e.target.value)} className="input mt-2"/></label><div><p className="text-sm font-semibold text-slate-700">Photo (optional)</p><label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-600 hover:border-blue-400"><ImagePlus size={20}/> Add Photo<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e)=>chooseImage(e.target.files?.[0])}/></label>{imagePreview && <div className="relative mt-3 overflow-hidden rounded-2xl border border-slate-200"><img src={imagePreview} alt="Announcement preview" className="max-h-64 w-full bg-slate-50 object-contain"/><button type="button" onClick={clearImage} className="absolute right-2 top-2 rounded-full bg-slate-950/70 p-2 text-white"><X size={16}/></button></div>}</div></div><button type="submit" disabled={saving} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="animate-spin"/> : <Send/>}{saving ? 'Publishing…' : 'Publish announcement'}</button></form>}
      <div className="p-6"><div className="flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Announcement history</h3><p className="mt-1 text-sm text-slate-500">Published, hidden, and expired notices</p></div><BellRing className="text-blue-700"/></div><div className="mt-4"><SortControls id="announcements" field={sortField} direction={sortDirection} options={[{value:'created_at',label:'Created date'},{value:'title',label:'Title'},{value:'priority',label:'Priority'},{value:'audience',label:'Audience'}]} onFieldChange={setSortField} onDirectionChange={setSortDirection}/></div>{loading ? <div className="flex justify-center py-16 text-slate-500"><Loader2 className="mr-2 animate-spin"/>Loading announcements…</div> : <div className="mt-5 space-y-4">{sorted.map((a)=>{ const long=a.message.length>240; const open=expanded.has(a.id); return <article key={a.id} className={`rounded-2xl border p-4 ${PRIORITY_STYLES[a.priority]}`}>{a.imageUrl && <button type="button" onClick={()=>setPreviewImage({title:a.title,url:a.imageUrl as string})} className="mb-4 block w-full overflow-hidden rounded-xl bg-white/70"><img src={a.imageUrl} alt={`Attached image for ${a.title}`} className="max-h-80 w-full object-contain"/></button>}<div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase">{PRIORITY_LABELS[a.priority]} · {AUDIENCE_LABELS[a.audience]}</p><h4 className="mt-2 font-bold text-slate-900">{a.title}</h4></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${a.is_published&&(!a.expires_at||new Date(a.expires_at).getTime()>currentTime) ? 'bg-emerald-100 text-emerald-700':'bg-slate-200 text-slate-600'}`}>{a.is_published?(a.expires_at&&new Date(a.expires_at).getTime()<=currentTime?'Expired':'Published'):'Hidden'}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{long && !open ? `${a.message.slice(0,240).trim()}…` : a.message}</p>{long && <button type="button" onClick={()=>setExpanded((prev)=>{const next=new Set(prev); if(next.has(a.id)) next.delete(a.id); else next.add(a.id); return next;})} className="mt-2 text-sm font-bold text-blue-700">{open?'Show Less':'See More'}</button>}<p className="mt-3 text-xs text-slate-500">Published {formatDateTime(a.published_at)}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={()=>void togglePublished(a)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">{a.is_published?'Hide':'Publish'}</button><button type="button" onClick={()=>void deleteAnnouncement(a)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700"><Trash2 size={14}/>Delete</button></div></article>;})}{!sorted.length && <div className="rounded-2xl border-2 border-dashed border-slate-200 px-5 py-12 text-center text-sm text-slate-500">No announcements yet.</div>}</div>}</div>
    </div>
    {previewImage&&<div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/90 p-4" onClick={()=>setPreviewImage(null)}><button type="button" onClick={()=>setPreviewImage(null)} className="absolute right-5 top-5 rounded-full bg-white p-2 text-slate-900"><X size={20}/></button><img src={previewImage.url} alt={previewImage.title} className="max-h-[90vh] max-w-full rounded-2xl object-contain"/></div>}
  </section>;
}
