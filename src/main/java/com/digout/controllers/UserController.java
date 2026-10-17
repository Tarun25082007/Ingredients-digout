package com.digout.controllers;

import com.digout.dto.UserProfileDTO;
import com.digout.models.User;
import com.digout.repositories.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

@RestController
@RequestMapping("/api/user")
public class UserController {

    private final UserRepository userRepository;
    private final com.digout.repositories.ScanHistoryRepository scanHistoryRepository;

    public UserController(UserRepository userRepository, com.digout.repositories.ScanHistoryRepository scanHistoryRepository) {
        this.userRepository = userRepository;
        this.scanHistoryRepository = scanHistoryRepository;
    }

    @GetMapping("/profile")
    public ResponseEntity<?> getProfile() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(java.util.Map.of("message", "User not authenticated."));
        }

        String email = auth.getName();
        Optional<User> userOpt = userRepository.findByAnyEmail(email);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(java.util.Map.of("message", "User not found."));
        }

        return ResponseEntity.ok(UserProfileDTO.fromUser(userOpt.get()));
    }

    @PutMapping("/profile")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<?> updateProfile(@RequestBody UserProfileDTO dto) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(java.util.Map.of("message", "User not authenticated."));
        }

        String email = auth.getName();
        Optional<User> userOpt = userRepository.findByAnyEmail(email);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(java.util.Map.of("message", "User not found."));
        }

        User user = userOpt.get();
        if (dto.fullName() != null) {
            String sanitizedName = dto.fullName().trim();
            if (sanitizedName.length() > 100) sanitizedName = sanitizedName.substring(0, 100);
            user.setFullName(sanitizedName);
        }
        
        if (dto.age() != null) {
            if (dto.age() < 1 || dto.age() > 130) {
                return ResponseEntity.badRequest().body(java.util.Map.of("message", "Invalid age. Must be between 1 and 130."));
            }
            user.setAge(dto.age());
        }
        
        if (dto.gender() != null) {
            String g = dto.gender().trim().toUpperCase();
            if (!java.util.Set.of("MALE", "FEMALE", "OTHER").contains(g)) {
                return ResponseEntity.badRequest().body(java.util.Map.of("message", "Invalid gender. Must be MALE, FEMALE, or OTHER."));
            }
            user.setGender(g);
        }
        
        if (dto.heightCm() != null) {
            if (dto.heightCm() < 30 || dto.heightCm() > 300) {
                return ResponseEntity.badRequest().body(java.util.Map.of("message", "Invalid height. Must be between 30cm and 300cm."));
            }
            user.setHeightCm(dto.heightCm());
        }
        
        if (dto.weightKg() != null) {
            if (dto.weightKg() < 5 || dto.weightKg() > 500) {
                return ResponseEntity.badRequest().body(java.util.Map.of("message", "Invalid weight. Must be between 5kg and 500kg."));
            }
            user.setWeightKg(dto.weightKg());
        }
        
        if (dto.activityLevel() != null) {
            String sanitizedActivity = dto.activityLevel().trim();
            if (sanitizedActivity.length() > 50) sanitizedActivity = sanitizedActivity.substring(0, 50);
            user.setActivityLevel(sanitizedActivity);
        }

        if (dto.calorieGoal() != null) {
            String sanitizedGoal = dto.calorieGoal().trim();
            if (sanitizedGoal.length() > 50) sanitizedGoal = sanitizedGoal.substring(0, 50);
            user.setCalorieGoal(sanitizedGoal);
        }
        
        if (dto.medicalConditions() != null) {
            String sanitizedConditions = dto.medicalConditions().trim();
            if (sanitizedConditions.length() > 1000) {
                sanitizedConditions = sanitizedConditions.substring(0, 1000);
                int lastComma = sanitizedConditions.lastIndexOf(",");
                if (lastComma > 500) {
                    sanitizedConditions = sanitizedConditions.substring(0, lastComma);
                }
            }
            String effectiveGender = dto.gender() != null ? dto.gender() : user.getGender();
            if ("MALE".equalsIgnoreCase(effectiveGender)) {
                sanitizedConditions = java.util.Arrays.stream(sanitizedConditions.split(","))
                    .map(String::trim)
                    .filter(s -> !s.equalsIgnoreCase("PREGNANCY") && !s.toLowerCase().contains("pregnan") && !s.equalsIgnoreCase("PCOS") && !s.toLowerCase().contains("pcos") && !s.toLowerCase().contains("lactat") && !s.toLowerCase().contains("breastfeed"))
                    .collect(java.util.stream.Collectors.joining(", "));
            } else if ("FEMALE".equalsIgnoreCase(effectiveGender)) {
                sanitizedConditions = java.util.Arrays.stream(sanitizedConditions.split(","))
                    .map(String::trim)
                    .filter(s -> !s.equalsIgnoreCase("PROSTATE") && !s.toLowerCase().contains("prostate"))
                    .collect(java.util.stream.Collectors.joining(", "));
            }
            user.setMedicalConditions(sanitizedConditions);
        }
        
        if (dto.strictnessLevel() != null) {
            String s = dto.strictnessLevel().trim().toUpperCase();
            if (!java.util.Set.of("STANDARD", "STRICT").contains(s)) {
                return ResponseEntity.badRequest().body(java.util.Map.of("message", "Invalid strictness level. Must be STANDARD or STRICT."));
            }
            user.setStrictnessLevel(s);
        }
        
        user.setProfileCompleted(true);
        userRepository.save(user);

        return ResponseEntity.ok(UserProfileDTO.fromUser(user));
    }

    @DeleteMapping("/account")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<?> deleteAccount() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(java.util.Map.of("message", "User not authenticated."));
        }

        String email = auth.getName();
        Optional<User> userOpt = userRepository.findByAnyEmail(email);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(java.util.Map.of("message", "User not found."));
        }

        User user = userOpt.get();
        scanHistoryRepository.deleteByUserId(user.getId());
        userRepository.delete(user);

        return ResponseEntity.ok(java.util.Map.of("message", "Account and all associated data deleted successfully."));
    }
}
