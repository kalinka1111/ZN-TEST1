import React, { useState, useEffect } from 'react';
import { Upload, Save, Eye, Trash2, Play, Pause, FileText, Music, Video, CheckCircle, AlertCircle } from 'lucide-react';

const ZNKLessonCreator = () => {
  const [lessons, setLessons] = useState([]);
  const [currentLesson, setCurrentLesson] = useState({
    id: null,
    title: '',
    content: '',
    type: 'lecture', // lecture, mathematiques, sciences, etc.
    level: 'maternelle', // maternelle, primaire, college
    audioFile: null,
    videoFile: null,
    audioUrl: '',
    videoUrl: '',
    status: 'draft',
    createdAt: null
  });
  const [showPreview, setShowPreview] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });

  // Charger les leçons depuis le storage
  useEffect(() => {
    loadLessons();
  }, []);

  const loadLessons = async () => {
    try {
      const result = await window.storage.list('lesson:');
      if (result && result.keys) {
        const loadedLessons = [];
        for (const key of result.keys) {
          try {
            const lessonData = await window.storage.get(key);
            if (lessonData) {
              loadedLessons.push(JSON.parse(lessonData.value));
            }
          } catch (err) {
            console.log('Leçon non trouvée:', key);
          }
        }
        setLessons(loadedLessons.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      }
    } catch (error) {
      console.log('Erreur chargement:', error);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 3000);
  };

  const handleFileUpload = (e, fileType) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (fileType === 'audio') {
        setCurrentLesson({
          ...currentLesson,
          audioFile: file,
          audioUrl: event.target.result
        });
        showNotification('Audio ajouté avec succès', 'success');
      } else if (fileType === 'video') {
        setCurrentLesson({
          ...currentLesson,
          videoFile: file,
          videoUrl: event.target.result
        });
        showNotification('Vidéo ajoutée avec succès', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  const saveLesson = async () => {
    if (!currentLesson.title || !currentLesson.content) {
      showNotification('Titre et contenu requis', 'error');
      return;
    }

    const lessonId = currentLesson.id || `lesson_${Date.now()}`;
    const lessonData = {
      ...currentLesson,
      id: lessonId,
      createdAt: currentLesson.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await window.storage.set(`lesson:${lessonId}`, JSON.stringify(lessonData));
      showNotification('Leçon sauvegardée avec succès', 'success');
      await loadLessons();
      resetForm();
    } catch (error) {
      showNotification('Erreur lors de la sauvegarde', 'error');
      console.error('Erreur:', error);
    }
  };

  const publishLesson = async () => {
    if (!currentLesson.title || !currentLesson.content) {
      showNotification('Complétez tous les champs', 'error');
      return;
    }

    const lessonId = currentLesson.id || `lesson_${Date.now()}`;
    const lessonData = {
      ...currentLesson,
      id: lessonId,
      status: 'published',
      createdAt: currentLesson.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString()
    };

    try {
      await window.storage.set(`lesson:${lessonId}`, JSON.stringify(lessonData), true);
      showNotification('Leçon publiée et disponible pour les élèves', 'success');
      await loadLessons();
      resetForm();
    } catch (error) {
      showNotification('Erreur lors de la publication', 'error');
      console.error('Erreur:', error);
    }
  };

  const deleteLesson = async (lessonId) => {
    if (!confirm('Supprimer cette leçon ?')) return;

    try {
      await window.storage.delete(`lesson:${lessonId}`);
      showNotification('Leçon supprimée', 'success');
      await loadLessons();
    } catch (error) {
      showNotification('Erreur lors de la suppression', 'error');
    }
  };

  const editLesson = (lesson) => {
    setCurrentLesson(lesson);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setCurrentLesson({
      id: null,
      title: '',
      content: '',
      type: 'lecture',
      level: 'maternelle',
      audioFile: null,
      videoFile: null,
      audioUrl: '',
      videoUrl: '',
      status: 'draft',
      createdAt: null
    });
  };

  const lessonTypes = [
    { value: 'lecture', label: '📖 Lecture', color: 'from-blue-500 to-cyan-500' },
    { value: 'mathematiques', label: '🔢 Mathématiques', color: 'from-purple-500 to-pink-500' },
    { value: 'sciences', label: '🔬 Sciences', color: 'from-green-500 to-emerald-500' },
    { value: 'histoire', label: '📜 Histoire', color: 'from-amber-500 to-orange-500' },
    { value: 'geographie', label: '🌍 Géographie', color: 'from-teal-500 to-cyan-500' },
    { value: 'musique', label: '🎵 Musique', color: 'from-pink-500 to-rose-500' },
    { value: 'art', label: '🎨 Art', color: 'from-indigo-500 to-purple-500' },
    { value: 'sport', label: '⚽ Sport', color: 'from-red-500 to-orange-500' }
  ];

  const levels = [
    { value: 'maternelle', label: 'Maternelle 👶' },
    { value: 'primaire', label: 'Primaire 🎒' },
    { value: 'college', label: 'Collège 📚' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                ZNK Création de Leçons
              </h1>
              <p className="text-gray-300 mt-2">Créez et gérez vos contenus pédagogiques</p>
            </div>
            <div className="text-right">
              <div className="text-3xl mb-2">📚</div>
              <div className="text-sm text-gray-400">{lessons.length} leçons créées</div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification.show && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-slide-in ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {notification.type === 'success' ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulaire de création */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 shadow-2xl">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <FileText className="text-orange-400" />
              {currentLesson.id ? 'Modifier la leçon' : 'Nouvelle leçon'}
            </h2>

            {/* Titre */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 text-gray-300">Titre de la leçon *</label>
              <input
                type="text"
                value={currentLesson.title}
                onChange={(e) => setCurrentLesson({ ...currentLesson, title: e.target.value })}
                placeholder="Ex: Les voyelles - Lettre A"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 outline-none transition-all"
              />
            </div>

            {/* Type et Niveau */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Type de leçon *</label>
                <select
                  value={currentLesson.type}
                  onChange={(e) => setCurrentLesson({ ...currentLesson, type: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 outline-none transition-all"
                >
                  {lessonTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Niveau *</label>
                <select
                  value={currentLesson.level}
                  onChange={(e) => setCurrentLesson({ ...currentLesson, level: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 outline-none transition-all"
                >
                  {levels.map(level => (
                    <option key={level.value} value={level.value}>{level.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Contenu */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 text-gray-300">Contenu de la leçon *</label>
              <textarea
                value={currentLesson.content}
                onChange={(e) => setCurrentLesson({ ...currentLesson, content: e.target.value })}
                placeholder="Écrivez ou collez le contenu de votre leçon ici..."
                rows={10}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 outline-none transition-all resize-none"
              />
            </div>

            {/* Upload Audio */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 text-gray-300 flex items-center gap-2">
                <Music size={18} className="text-pink-400" />
                Audio (optionnel)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => handleFileUpload(e, 'audio')}
                  className="hidden"
                  id="audioUpload"
                />
                <label
                  htmlFor="audioUpload"
                  className="flex items-center justify-center gap-3 w-full px-4 py-4 rounded-xl bg-gradient-to-r from-pink-500/20 to-purple-500/20 border-2 border-dashed border-pink-400/50 hover:border-pink-400 cursor-pointer transition-all"
                >
                  <Upload size={24} className="text-pink-400" />
                  <span>{currentLesson.audioFile ? currentLesson.audioFile.name : 'Cliquer pour uploader un audio'}</span>
                </label>
              </div>
              {currentLesson.audioUrl && (
                <audio controls className="w-full mt-3 rounded-xl" src={currentLesson.audioUrl} />
              )}
            </div>

            {/* Upload Vidéo */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 text-gray-300 flex items-center gap-2">
                <Video size={18} className="text-cyan-400" />
                Vidéo (optionnel)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => handleFileUpload(e, 'video')}
                  className="hidden"
                  id="videoUpload"
                />
                <label
                  htmlFor="videoUpload"
                  className="flex items-center justify-center gap-3 w-full px-4 py-4 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-2 border-dashed border-cyan-400/50 hover:border-cyan-400 cursor-pointer transition-all"
                >
                  <Upload size={24} className="text-cyan-400" />
                  <span>{currentLesson.videoFile ? currentLesson.videoFile.name : 'Cliquer pour uploader une vidéo'}</span>
                </label>
              </div>
              {currentLesson.videoUrl && (
                <video controls className="w-full mt-3 rounded-xl" src={currentLesson.videoUrl} />
              )}
            </div>

            {/* Boutons d'action */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={saveLesson}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <Save size={20} />
                Sauvegarder (brouillon)
              </button>
              <button
                onClick={publishLesson}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <CheckCircle size={20} />
                Publier pour les élèves
              </button>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <Eye size={20} />
                Prévisualiser
              </button>
              {currentLesson.id && (
                <button
                  onClick={resetForm}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 transition-all"
                >
                  Annuler
                </button>
              )}
            </div>
          </div>

          {/* Prévisualisation */}
          {showPreview && currentLesson.content && (
            <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 shadow-2xl">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                <Eye className="text-purple-400" />
                Aperçu de la leçon
              </h2>
              <div className="bg-white/5 rounded-2xl p-6">
                <h3 className="text-xl font-bold text-orange-400 mb-4">{currentLesson.title}</h3>
                <div className="text-gray-200 whitespace-pre-wrap">{currentLesson.content}</div>
                {currentLesson.audioUrl && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-400 mb-2">🎵 Audio inclus</p>
                    <audio controls className="w-full rounded-xl" src={currentLesson.audioUrl} />
                  </div>
                )}
                {currentLesson.videoUrl && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-400 mb-2">🎬 Vidéo incluse</p>
                    <video controls className="w-full rounded-xl" src={currentLesson.videoUrl} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Liste des leçons */}
        <div className="space-y-6">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 shadow-2xl">
            <h2 className="text-2xl font-bold mb-6">Mes leçons</h2>
            <div className="space-y-3 max-h-[800px] overflow-y-auto pr-2">
              {lessons.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileText size={48} className="mx-auto mb-4 opacity-50" />
                  <p>Aucune leçon créée</p>
                </div>
              ) : (
                lessons.map(lesson => {
                  const lessonType = lessonTypes.find(t => t.value === lesson.type);
                  return (
                    <div
                      key={lesson.id}
                      className="bg-white/5 rounded-2xl p-4 border border-white/10 hover:border-white/30 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{lessonType?.label.split(' ')[0]}</span>
                            <h3 className="font-semibold text-sm">{lesson.title}</h3>
                          </div>
                          <p className="text-xs text-gray-400">
                            {lesson.level} • {new Date(lesson.createdAt).toLocaleDateString()}
                          </p>
                          <div className="mt-2">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              lesson.status === 'published' 
                                ? 'bg-green-500/20 text-green-300' 
                                : 'bg-yellow-500/20 text-yellow-300'
                            }`}>
                              {lesson.status === 'published' ? '✓ Publiée' : '📝 Brouillon'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => editLesson(lesson)}
                          className="flex-1 px-3 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-sm transition-all"
                        >
                          ✏️ Modifier
                        </button>
                        <button
                          onClick={() => deleteLesson(lesson.id)}
                          className="px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default ZNKLessonCreator;