import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import api from '../api';
import { X, Activity, Heart, ShieldAlert, Sparkles, Check } from 'lucide-react';

const COMMON_CONDITIONS = [
  { id: 'PREGNANCY', label: '🤰 Pregnancy / Lactation', desc: 'Strict safety checks for caffeine, additives, raw ingredients' },
  { id: 'DIABETES', label: '🩸 Diabetes / Pre-diabetes', desc: 'Flags high sugar, refined carbs, high glycemic index' },
  { id: 'ULCERS', label: '🔥 Gastric Ulcers / Acid Reflux / GERD', desc: 'Flags chili, capsaicin, high-acid, spicy irritants' },
  { id: 'HYPERTENSION', label: '🫀 Hypertension / High BP', desc: 'Flags excess sodium and trans fats' },
  { id: 'CHOLESTEROL', label: '🫁 High Cholesterol / Heart Health', desc: 'Flags saturated fats, palm oil, trans fats' },
  { id: 'GLUTEN_ALLERGY', label: '🌾 Celiac / Gluten Sensitivity', desc: 'Flags wheat, barley, rye, gluten' },
  { id: 'LACTOSE_INTOLERANCE', label: '🥛 Lactose Intolerance', desc: 'Flags dairy milk, whey, lactose' },
  { id: 'NUT_ALLERGY', label: '🥜 Peanut / Tree Nut Allergy', desc: 'Flags peanuts, almonds, cashews, tree nuts' },
];

const CALORIE_GOALS = [
  { id: 'DEFICIT', label: '🥗 Calorie Deficit', desc: 'Weight / Fat Loss (alerts on empty calories)' },
  { id: 'MAINTENANCE', label: '⚖️ Maintenance', desc: 'Balanced health & weight maintenance' },
  { id: 'SURPLUS', label: '💪 Calorie Surplus', desc: 'Bulking / Muscle Gain / High Energy' }
];

const ACTIVITY_LEVELS = [
  { id: 'SEDENTARY', label: 'Sedentary', desc: 'Little or no regular exercise' },
  { id: 'MODERATE', label: 'Moderately Active', desc: 'Exercise 3-5 days/week' },
  { id: 'ACTIVE', label: 'Very Active', desc: 'Intense exercise 6-7 days/week' }
];

const HealthProfileModal = ({ isOpen, onClose, onProfileUpdated, initialProfile = null, isMandatoryOnboarding = false }) => {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('PREFER_NOT_TO_SAY');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [activityLevel, setActivityLevel] = useState('MODERATE');
  const [calorieGoal, setCalorieGoal] = useState('MAINTENANCE');
  const [selectedConditions, setSelectedConditions] = useState([]);
  const [customCondition, setCustomCondition] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (initialProfile) {
      if (initialProfile.fullName) setFullName(initialProfile.fullName);
      if (initialProfile.age) setAge(initialProfile.age);
      if (initialProfile.gender) setGender(initialProfile.gender);
      if (initialProfile.heightCm) setHeightCm(initialProfile.heightCm);
      if (initialProfile.weightKg) setWeightKg(initialProfile.weightKg);
      if (initialProfile.activityLevel) setActivityLevel(initialProfile.activityLevel);
      if (initialProfile.calorieGoal) setCalorieGoal(initialProfile.calorieGoal);

      if (initialProfile.medicalConditions) {
        const raw = initialProfile.medicalConditions;
        const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
        const knownIds = COMMON_CONDITIONS.map(c => c.id);
        const matched = [];
        const customParts = [];

        parts.forEach(p => {
          if (knownIds.includes(p)) {
            matched.push(p);
          } else {
            customParts.push(p);
          }
        });
        setSelectedConditions(matched);
        setCustomCondition(customParts.join(', '));
      }
    }
  }, [initialProfile, isOpen]);

  if (!isOpen) return null;

  // Calculate live BMI
  const heightVal = parseFloat(heightCm);
  const weightVal = parseFloat(weightKg);
  let computedBmi = null;
  let bmiCategory = '';
  if (heightVal > 50 && weightVal > 20) {
    const hM = heightVal / 100.0;
    computedBmi = (weightVal / (hM * hM)).toFixed(1);
    if (computedBmi < 18.5) bmiCategory = 'Underweight';
    else if (computedBmi < 25.0) bmiCategory = 'Healthy Weight';
    else if (computedBmi < 30.0) bmiCategory = 'Overweight';
    else bmiCategory = 'Obese';
  }

  const toggleCondition = (id) => {
    setSelectedConditions(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const parsedAge = age ? parseInt(age, 10) : null;
      if (parsedAge !== null && (parsedAge < 1 || parsedAge > 120)) {
        setError('Please enter a valid age between 1 and 120.');
        setSaving(false);
        return;
      }
      if (heightVal && (heightVal < 40 || heightVal > 260)) {
        setError('Please enter a valid height between 40 cm and 260 cm.');
        setSaving(false);
        return;
      }
      if (weightVal && (weightVal < 15 || weightVal > 350)) {
        setError('Please enter a valid weight between 15 kg and 350 kg.');
        setSaving(false);
        return;
      }

      const allConditions = [...selectedConditions];
      if (customCondition.trim()) {
        allConditions.push(customCondition.trim());
      }

      const payload = {
        fullName: fullName.trim() || undefined,
        age: parsedAge,
        gender: gender || 'PREFER_NOT_TO_SAY',
        heightCm: heightVal || null,
        weightKg: weightVal || null,
        activityLevel,
        calorieGoal,
        medicalConditions: allConditions.join(', '),
        profileCompleted: true
      };

      const res = await api.put('/user/profile', payload);
      setSuccessMsg('Health Profile updated successfully!');
      if (onProfileUpdated) {
        onProfileUpdated(res.data);
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setError(err.response?.data?.message || err.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmation = window.prompt("⚠️ DANGER ZONE: Type 'DELETE' to permanently delete your account, health profile, and all scan history.");
    if (confirmation === 'DELETE') {
      try {
        await api.delete('/user/account');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userProfile');
        window.location.href = '/login';
      } catch (err) {
        setError('Failed to delete account. Please try again.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto relative border border-gray-100">
        
        {/* Close Button (if not mandatory) */}
        {!isMandatoryOnboarding && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition z-10"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white rounded-t-2xl relative">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black">{t('health_profile')}</h2>
              <p className="text-emerald-100 text-sm mt-0.5">
                Tailor food safety alerts, portion advice, and condition warnings to you.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-medium flex items-center space-x-2">
              <Check className="w-4 h-4" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Section 1: Basic Biometrics */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <span>1. Basic Biometrics</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('age')}</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  placeholder="e.g. 28"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('gender')}</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm outline-none bg-white"
                >
                  <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('height')}</label>
                <input
                  type="number"
                  min="50"
                  max="250"
                  placeholder="e.g. 175"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t('weight')}</label>
                <input
                  type="number"
                  min="20"
                  max="300"
                  placeholder="e.g. 70"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm outline-none"
                />
              </div>
            </div>

            {/* Live BMI Display */}
            {computedBmi && (
              <div className="mt-3 p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900">
                <span>{t('calculated_bmi')}: <strong className="text-emerald-800 text-sm">{computedBmi}</strong></span>
                <span className="px-2.5 py-0.5 bg-emerald-200/80 font-bold rounded-full">{bmiCategory}</span>
              </div>
            )}
          </div>

          {/* Section 2: Fitness & Calorie Goals */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-teal-600" />
              <span>2. {t('calorie_goal')}</span>
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
              {CALORIE_GOALS.map((goal) => {
                const active = calorieGoal === goal.id;
                return (
                  <button
                    type="button"
                    key={goal.id}
                    onClick={() => setCalorieGoal(goal.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      active 
                        ? 'border-teal-500 bg-teal-50/80 shadow-sm ring-1 ring-teal-500' 
                        : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
                    }`}
                  >
                    <div className="font-bold text-sm text-gray-800">{goal.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-snug">{goal.desc}</div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {ACTIVITY_LEVELS.map((act) => {
                const active = activityLevel === act.id;
                return (
                  <button
                    type="button"
                    key={act.id}
                    onClick={() => setActivityLevel(act.id)}
                    className={`py-2 px-3 rounded-lg border text-center text-xs font-semibold transition ${
                      active
                        ? 'border-emerald-500 bg-emerald-100 text-emerald-900'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {act.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Medical Conditions & Life Stages */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-purple-600" />
              <span>3. {t('medical_conditions')}</span>
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Select any conditions that apply. The AI will flag dangerous triggers (e.g. ulcer irritants, pregnancy risks, diabetic sugar spikes) in <strong className="text-purple-700">PURPLE</strong> or <strong className="text-red-600">RED</strong>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMMON_CONDITIONS.map((cond) => {
                const isSelected = selectedConditions.includes(cond.id);
                return (
                  <button
                    type="button"
                    key={cond.id}
                    onClick={() => toggleCondition(cond.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start space-x-2.5 ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50/70 shadow-sm ring-1 ring-purple-400'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center border ${
                      isSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300 bg-white'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-xs text-gray-800">{cond.label}</div>
                      <div className="text-[11px] text-gray-500 leading-tight mt-0.5">{cond.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Notes */}
            <div className="mt-3">
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Other Conditions, Medications, or Specific Dietary Sensitivities (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Gout, Kidney stones, Nightshade allergy, Thyroid..."
                value={customCondition}
                onChange={(e) => setCustomCondition(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
            </div>
          </div>

          {/* Danger Zone */}
          {!isMandatoryOnboarding && initialProfile && (
            <div className="pt-4 mt-2 border-t border-red-100">
              <div className="bg-red-50 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-red-800">Danger Zone</h4>
                  <p className="text-xs text-red-600 mt-1">Permanently delete your account, health profile, and all scan data. This action cannot be undone.</p>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="mt-3 sm:mt-0 px-4 py-2 bg-red-100 hover:bg-red-600 text-red-700 hover:text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                >
                  Delete Account
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-4 mt-2 border-t border-gray-100 flex items-center justify-between">
            {!isMandatoryOnboarding ? (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 transition"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition"
              >
                Skip for now
              </button>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition transform hover:-translate-y-0.5 text-sm disabled:opacity-50"
            >
              {saving ? 'Saving Profile...' : `${t('save_profile')} ✨`}
            </button>
          </div>

          {/* Subtle AI Disclaimer */}
          <div className="text-center pt-1">
            <p className="text-[11px] text-gray-400">
              ℹ️ AI-generated health guidance. AI can make mistakes — always consult a healthcare professional.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default HealthProfileModal;
