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

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/profile")
    public ResponseEntity<?> getProfile() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated.");
        }

        String email = auth.getName();
        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("User not found.");
        }

        return ResponseEntity.ok(UserProfileDTO.fromUser(userOpt.get()));
    }

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(@RequestBody UserProfileDTO dto) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("User not authenticated.");
        }

        String email = auth.getName();
        Optional<User> userOpt = userRepository.findByEmail(email);
        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("User not found.");
        }

        User user = userOpt.get();
        if (dto.fullName() != null && !dto.fullName().isBlank()) {
            user.setFullName(dto.fullName().trim());
        }
        user.setAge(dto.age());
        user.setGender(dto.gender());
        user.setHeightCm(dto.heightCm());
        user.setWeightKg(dto.weightKg());
        user.setActivityLevel(dto.activityLevel());
        user.setCalorieGoal(dto.calorieGoal());
        user.setMedicalConditions(dto.medicalConditions());
        user.setProfileCompleted(true);

        userRepository.save(user);

        return ResponseEntity.ok(UserProfileDTO.fromUser(user));
    }
}
