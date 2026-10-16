import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import api from '../api';
import { X, Activity, Heart, ShieldAlert, Sparkles, Check, Trash2 } from 'lucide-react';

const KNOWN_CONDITION_IDS = ['PREGNANCY', 'PCOS', 'PROSTATE', 'DIABETES', 'ULCERS', 'HYPERTENSION', 'CHOLESTEROL', 'GLUTEN_ALLERGY', 'LACTOSE_INTOLERANCE', 'NUT_ALLERGY'];

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
  const [strictnessLevel, setStrictnessLevel] = useState('STANDARD');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const getCommonConditions = () => [
    { id: 'PREGNANCY', label: t('cond_pregnancy_title'), desc: t('cond_pregnancy_desc'), gender: 'FEMALE' },
    { id: 'PCOS', label: t('cond_pcos_title'), desc: t('cond_pcos_desc'), gender: 'FEMALE' },
    { id: 'PROSTATE', label: t('cond_prostate_title'), desc: t('cond_prostate_desc'), gender: 'MALE' },
    { id: 'DIABETES', label: t('cond_diabetes_title'), desc: t('cond_diabetes_desc') },
    { id: 'ULCERS', label: t('cond_ulcers_title'), desc: t('cond_ulcers_desc') },
    { id: 'HYPERTENSION', label: t('cond_hypertension_title'), desc: t('cond_hypertension_desc') },
    { id: 'CHOLESTEROL', label: t('cond_cholesterol_title'), desc: t('cond_cholesterol_desc') },
    { id: 'GLUTEN_ALLERGY', label: t('cond_gluten_title'), desc: t('cond_gluten_desc') },
    { id: 'LACTOSE_INTOLERANCE', label: t('cond_lactose_title'), desc: t('cond_lactose_desc') },
    { id: 'NUT_ALLERGY', label: t('cond_nuts_title'), desc: t('cond_nuts_desc') },
  ];

  const getCalorieGoals = () => [
    { id: 'DEFICIT', label: t('goal_deficit_title'), desc: t('goal_deficit_desc') },
    { id: 'MAINTENANCE', label: t('goal_maint_title'), desc: t('goal_maint_desc') },
    { id: 'SURPLUS', label: t('goal_surplus_title'), desc: t('goal_surplus_desc') }
  ];

  const getActivityLevels = () => [
    { id: 'SEDENTARY', label: t('activity_sedentary_title'), desc: t('activity_sedentary_desc') },
    { id: 'MODERATE', label: t('activity_mod_title'), desc: t('activity_mod_desc') },
    { id: 'ACTIVE', label: t('activity_active_title'), desc: t('activity_active_desc') }
  ];

  useEffect(() => {
    if (initialProfile) {
      if (initialProfile.fullName) setFullName(initialProfile.fullName);
      if (initialProfile.age) setAge(initialProfile.age);
      if (initialProfile.gender) setGender(initialProfile.gender);
      if (initialProfile.heightCm) setHeightCm(initialProfile.heightCm);
      if (initialProfile.weightKg) setWeightKg(initialProfile.weightKg);
      if (initialProfile.activityLevel) setActivityLevel(initialProfile.activityLevel);
      if (initialProfile.calorieGoal) setCalorieGoal(initialProfile.calorieGoal);
      if (initialProfile.strictnessLevel) setStrictnessLevel(initialProfile.strictnessLevel);

      if (initialProfile.medicalConditions) {
        const raw = initialProfile.medicalConditions;
        const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
        const knownIds = KNOWN_CONDITION_IDS;
        const matched = [];
        const customParts = [];

        parts.forEach(p => {
          if (knownIds.includes(p)) {
            if (initialProfile.gender === 'MALE' && (p === 'PREGNANCY' || p === 'PCOS')) return;
            if (initialProfile.gender === 'FEMALE' && p === 'PROSTATE') return;
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

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !showDeleteAccountConfirm && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showDeleteAccountConfirm, saving, onClose]);

  if (!isOpen) return null;

  // Calculate live BMI
  const heightVal = parseFloat(heightCm);
  const weightVal = parseFloat(weightKg);
  let computedBmi = null;
  let bmiCategory = '';
  let bmiColor = {
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    text: 'text-emerald-900',
    strongText: 'text-emerald-700',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-300'
  };

  if (heightVal > 50 && weightVal > 20) {
    const hM = heightVal / 100.0;
    const bmiNum = weightVal / (hM * hM);
    computedBmi = bmiNum.toFixed(1);
    if (bmiNum < 18.5) {
      bmiCategory = t('bmi_underweight');
      bmiColor = {
        bg: 'bg-purple-50',
        border: 'border-purple-300',
        text: 'text-purple-900',
        strongText: 'text-purple-700',
        badgeBg: 'bg-purple-100',
        badgeText: 'text-purple-700',
        badgeBorder: 'border-purple-200'
      };
    } else if (bmiNum < 25.0) {
      bmiCategory = t('bmi_healthy');
      bmiColor = {
        bg: 'bg-emerald-50',
        border: 'border-emerald-300',
        text: 'text-emerald-900',
        strongText: 'text-emerald-700',
        badgeBg: 'bg-emerald-100',
        badgeText: 'text-emerald-800',
        badgeBorder: 'border-emerald-300'
      };
    } else if (bmiNum < 30.0) {
      bmiCategory = t('bmi_overweight');
      bmiColor = {
        bg: 'bg-yellow-50',
        border: 'border-yellow-300',
        text: 'text-yellow-900',
        strongText: 'text-yellow-800',
        badgeBg: 'bg-yellow-100',
        badgeText: 'text-yellow-800',
        badgeBorder: 'border-yellow-300'
      };
    } else if (bmiNum < 35.0) {
      bmiCategory = t('bmi_obese');
      bmiColor = {
        bg: 'bg-red-50',
        border: 'border-red-300',
        text: 'text-red-900',
        strongText: 'text-red-800',
        badgeBg: 'bg-red-100',
        badgeText: 'text-red-800',
        badgeBorder: 'border-red-300'
      };
    } else {
      bmiCategory = t('bmi_severely_obese') || 'Severely Obese';
      bmiColor = {
        bg: 'bg-purple-50',
        border: 'border-purple-300',
        text: 'text-purple-900',
        strongText: 'text-purple-700',
        badgeBg: 'bg-purple-100',
        badgeText: 'text-purple-700',
        badgeBorder: 'border-purple-200'
      };
    }
  }

  const toggleCondition = (id) => {
    setSelectedConditions(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleGenderChange = (newGender) => {
    setGender(newGender);
    if (newGender === 'MALE') {
      setSelectedConditions(prev => prev.filter(id => id !== 'PREGNANCY' && id !== 'PCOS'));
    } else if (newGender === 'FEMALE') {
      setSelectedConditions(prev => prev.filter(id => id !== 'PROSTATE'));
    }
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

      let allConditions = [...selectedConditions];
      if (customCondition.trim()) {
        allConditions.push(customCondition.trim());
      }

      if (gender === 'MALE') {
        allConditions = allConditions.filter(c => {
          const lower = c.toLowerCase();
          return !lower.includes('pregnan') && !lower.includes('lactat') && !lower.includes('pcos') && !lower.includes('breastfeed');
        });
      } else if (gender === 'FEMALE') {
        allConditions = allConditions.filter(c => {
          const lower = c.toLowerCase();
          return !lower.includes('prostate');
        });
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
        strictnessLevel,
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

  const handleConfirmDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setIsDeletingAccount(true);
    try {
      await api.delete('/user/account');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('userProfile');
      window.location.href = '/login';
    } catch (err) {
      setError('Failed to delete account. Please try again.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={() => {
        if (!showDeleteAccountConfirm && !saving) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto relative border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Close Button - Always visible for quick exit */}
        <button 
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-full transition z-20 backdrop-blur-md cursor-pointer border border-white/20 shadow-sm active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white rounded-t-2xl relative">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black">{t('health_profile')}</h2>
              <p className="text-emerald-100 text-sm mt-0.5">
                {t('profile_subtitle')}
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
              <span>{t('basic_biometrics')}</span>
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
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { value: 'MALE', label: t('gender_male') },
                    { value: 'FEMALE', label: t('gender_female') },
                    { value: 'OTHER', label: t('gender_other') },
                    { value: 'PREFER_NOT_TO_SAY', label: t('gender_not_specified') },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleGenderChange(opt.value)}
                      className={`px-1 py-1.5 border rounded-lg text-[11px] font-semibold transition truncate text-center ${
                        gender === opt.value
                          ? 'border-emerald-500 bg-emerald-100 text-emerald-900 font-bold'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                      title={opt.label}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
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
              <div className={`mt-3 p-3 ${bmiColor.bg} border ${bmiColor.border} rounded-xl flex items-center justify-between text-xs ${bmiColor.text} transition-colors duration-200 shadow-sm`}>
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-gray-700">{t('calculated_bmi')}:</span>
                  <strong className={`${bmiColor.strongText} text-base font-black`}>{computedBmi}</strong>
                </div>
                <span className={`px-2.5 py-1 ${bmiColor.badgeBg} ${bmiColor.badgeText} border ${bmiColor.badgeBorder} font-bold rounded-full text-xs shadow-xs`}>
                  {bmiCategory}
                </span>
              </div>
            )}

            {/* Visual BMI Color Scale & Spectrum */}
            <div className="mt-3 p-3 bg-gray-50/90 border border-gray-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                <span className="flex items-center space-x-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t('bmi_scale_title')}</span>
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">WHO Guidelines</span>
              </div>

              {/* Multi-segment Spectrum Bar */}
              <div className="relative">
                <div className="grid grid-cols-5 gap-1.5 h-2.5 rounded-full overflow-hidden bg-gray-200/80 p-0.5 shadow-inner">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      computedBmi && parseFloat(computedBmi) < 18.5 
                        ? 'bg-purple-600 ring-2 ring-purple-600 ring-offset-1 scale-y-125 shadow-sm' 
                        : 'bg-purple-400 opacity-60'
                    }`} 
                    title="< 18.5: Underweight"
                  />
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      computedBmi && parseFloat(computedBmi) >= 18.5 && parseFloat(computedBmi) < 25.0 
                        ? 'bg-emerald-600 ring-2 ring-emerald-600 ring-offset-1 scale-y-125 shadow-sm' 
                        : 'bg-emerald-400 opacity-60'
                    }`} 
                    title="18.5 - 24.9: Healthy Weight"
                  />
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      computedBmi && parseFloat(computedBmi) >= 25.0 && parseFloat(computedBmi) < 30.0 
                        ? 'bg-yellow-400 ring-2 ring-yellow-500 ring-offset-1 scale-y-125 shadow-sm' 
                        : 'bg-yellow-300 opacity-60'
                    }`} 
                    title="25.0 - 29.9: Overweight"
                  />
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      computedBmi && parseFloat(computedBmi) >= 30.0 && parseFloat(computedBmi) < 35.0 
                        ? 'bg-red-600 ring-2 ring-red-600 ring-offset-1 scale-y-125 shadow-sm' 
                        : 'bg-red-400 opacity-60'
                    }`} 
                    title="30.0 - 34.9: Obese"
                  />
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      computedBmi && parseFloat(computedBmi) >= 35.0 
                        ? 'bg-purple-600 ring-2 ring-purple-600 ring-offset-1 scale-y-125 shadow-sm' 
                        : 'bg-purple-400 opacity-60'
                    }`} 
                    title="≥ 35.0: Severely Obese"
                  />
                </div>
              </div>

              {/* Color Legend Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1 text-[11px]">
                <div className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg border transition-all ${
                  computedBmi && parseFloat(computedBmi) < 18.5 
                    ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold shadow-xs ring-1 ring-purple-300' 
                    : 'bg-white/80 border-gray-200 text-gray-600'
                }`}>
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0"></span>
                  <div className="truncate">
                    <span className="block leading-tight font-medium">&lt; 18.5</span>
                    <span className="text-[10px] text-gray-500 block leading-tight">{t('bmi_underweight')}</span>
                  </div>
                </div>

                <div className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg border transition-all ${
                  computedBmi && parseFloat(computedBmi) >= 18.5 && parseFloat(computedBmi) < 25.0 
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold shadow-xs ring-1 ring-emerald-300' 
                    : 'bg-white/80 border-gray-200 text-gray-600'
                }`}>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <div className="truncate">
                    <span className="block leading-tight font-medium">18.5–24.9</span>
                    <span className="text-[10px] text-gray-500 block leading-tight">{t('bmi_healthy')}</span>
                  </div>
                </div>

                <div className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg border transition-all ${
                  computedBmi && parseFloat(computedBmi) >= 25.0 && parseFloat(computedBmi) < 30.0 
                    ? 'bg-yellow-50 border-yellow-300 text-yellow-900 font-bold shadow-xs ring-1 ring-yellow-300' 
                    : 'bg-white/80 border-gray-200 text-gray-600'
                }`}>
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0"></span>
                  <div className="truncate">
                    <span className="block leading-tight font-medium">25–29.9</span>
                    <span className="text-[10px] text-gray-500 block leading-tight">{t('bmi_overweight')}</span>
                  </div>
                </div>

                <div className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg border transition-all ${
                  computedBmi && parseFloat(computedBmi) >= 30.0 && parseFloat(computedBmi) < 35.0 
                    ? 'bg-red-50 border-red-300 text-red-900 font-bold shadow-xs ring-1 ring-red-300' 
                    : 'bg-white/80 border-gray-200 text-gray-600'
                }`}>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"></span>
                  <div className="truncate">
                    <span className="block leading-tight font-medium">30–34.9</span>
                    <span className="text-[10px] text-gray-500 block leading-tight">{t('bmi_obese')}</span>
                  </div>
                </div>

                <div className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg border transition-all col-span-2 sm:col-span-1 ${
                  computedBmi && parseFloat(computedBmi) >= 35.0 
                    ? 'bg-purple-50 border-purple-300 text-purple-900 font-bold shadow-xs ring-1 ring-purple-300' 
                    : 'bg-white/80 border-gray-200 text-gray-600'
                }`}>
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0"></span>
                  <div className="truncate">
                    <span className="block leading-tight font-medium">≥ 35.0</span>
                    <span className="text-[10px] text-gray-500 block leading-tight">{t('bmi_severely_obese')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Fitness & Calorie Goals */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-teal-600" />
              <span>{t('calorie_fitness_goals')}</span>
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
              {getCalorieGoals().map((goal) => {
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
              {getActivityLevels().map((act) => {
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
              <span>{t('conditions_allergies_title')}</span>
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              {t('conditions_allergies_desc')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {getCommonConditions().filter(cond => {
                if (gender === 'MALE' && cond.gender === 'FEMALE') return false;
                if (gender === 'FEMALE' && cond.gender === 'MALE') return false;
                return true;
              }).map((cond) => {
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
                {t('custom_conditions_label')}
              </label>
              <input
                type="text"
                placeholder={t('custom_conditions_placeholder')}
                value={customCondition}
                onChange={(e) => setCustomCondition(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
              />
            </div>
          </div>

          {/* Section 4: AI Strictness Level */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center space-x-2">
              <span className="text-amber-500 text-lg leading-none">⚖️</span>
              <span>{t('ai_strictness_title')}</span>
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              {t('ai_strictness_desc')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStrictnessLevel('STANDARD')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  strictnessLevel === 'STANDARD'
                    ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-500'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="font-bold text-sm text-gray-800">{t('mode_standard_title')}</div>
                <div className="text-[11px] text-gray-500 leading-tight mt-1">
                  {t('mode_standard_desc')}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setStrictnessLevel('STRICT')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  strictnessLevel === 'STRICT'
                    ? 'border-red-500 bg-red-50/70 shadow-sm ring-1 ring-red-500'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="font-bold text-sm text-gray-800">{t('mode_strict_title')}</div>
                <div className="text-[11px] text-gray-500 leading-tight mt-1">
                  {t('mode_strict_desc')}
                </div>
              </button>
            </div>
          </div>

          {/* Danger Zone */}
          {/* Danger Zone */}
          {!isMandatoryOnboarding && initialProfile && (
            <div className="pt-4 mt-2 border-t border-red-100">
              <div className="bg-red-50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-red-800">{t('danger_zone')}</h4>
                  <p className="text-xs text-red-600 mt-0.5">{t('danger_zone_desc')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeleteAccountConfirm(true)}
                  className="px-4 py-2 bg-red-100 hover:bg-red-600 text-red-700 hover:text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer active:scale-95 shrink-0"
                >
                  {t('delete_account_btn')}
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
                aria-label="Close"
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 transition"
              >
                {t('cancel')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition"
              >
                {t('skip_for_now')}
              </button>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition transform hover:-translate-y-0.5 text-sm disabled:opacity-50"
            >
              {saving ? t('saving_profile') : `${t('save_profile')} ✨`}
            </button>
          </div>

          {/* Subtle AI Disclaimer */}
          <div className="text-center pt-1">
            <p className="text-[11px] text-gray-400">
              {t('ai_profile_disclaimer')}
            </p>
          </div>
        </form>
      </div>

      {/* Dedicated In-App Account Deletion Confirmation Modal Overlay */}
      {showDeleteAccountConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div 
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 text-gray-800 animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 bg-red-100 rounded-xl text-red-600 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-red-900">
                  {t('delete_account_btn') || "Delete Account"}
                </h3>
                <p className="text-xs text-red-600 font-medium">
                  {t('danger_zone') || "Danger Zone"}
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 mb-4 text-xs text-red-700 space-y-1">
              <p className="font-semibold text-red-900">
                ⚠️ {t('danger_zone_desc') || "Permanently delete your account, health profile, and all scan data. This action cannot be undone."}
              </p>
              <p className="text-[11px] text-red-600">
                Type <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-red-300 text-red-900 font-bold">DELETE</strong> below to confirm:
              </p>
            </div>

            <input
              type="text"
              autoFocus
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="w-full px-3.5 py-2 border border-red-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-red-500 bg-white mb-5 font-mono"
            />

            <div className="flex items-center justify-end space-x-2.5">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => {
                  setShowDeleteAccountConfirm(false);
                  setDeleteConfirmText('');
                }}
                className="px-4 py-2 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== 'DELETE' || isDeletingAccount}
                onClick={handleConfirmDeleteAccount}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-xl shadow-md hover:shadow-lg transition flex items-center space-x-1.5 cursor-pointer"
              >
                {isDeletingAccount ? (
                  <span>{t('deleting')}</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('confirm_delete_account') || 'Permanently Delete'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthProfileModal;
