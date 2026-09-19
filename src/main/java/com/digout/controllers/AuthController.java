package com.digout.controllers;

import com.digout.dto.AuthRequest;
import com.digout.dto.AuthResponse;
import com.digout.dto.RegisterRequest;
import com.digout.models.User;
import com.digout.repositories.UserRepository;
import com.digout.security.JwtTokenProvider;
import com.digout.util.EmailUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.HttpEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.util.LinkedMultiValueMap;

import java.util.Optional;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final RestTemplate restTemplate;

    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtTokenProvider jwtTokenProvider, RestTemplate restTemplate) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
        this.restTemplate = restTemplate;
    }
    
    @org.springframework.beans.factory.annotation.Value("${turnstile.secret:1x0000000000000000000000000000000AA}")
    private String turnstileSecret;
    
    private boolean verifyTurnstile(String token) {
        if (token == null || token.isEmpty()) return false;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            MultiValueMap<String, String> map= new LinkedMultiValueMap<>();
            map.add("secret", turnstileSecret);
            map.add("response", token);
            HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(map, headers);
            ResponseEntity<Map> response = this.restTemplate.postForEntity("https://challenges.cloudflare.com/turnstile/v0/siteverify", request, Map.class);
            return Boolean.TRUE.equals(response.getBody().get("success"));
        } catch(Exception e) {
            return false;
        }
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest request) {
        if (!verifyTurnstile(request.turnstileToken())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Captcha verification failed."));
        }
        
        if (request.email() == null || request.email().trim().isEmpty() || !request.email().contains("@")) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "A valid email is required."));
        }
        String normalizedEmail = request.email().trim().toLowerCase();
        String canonicalEmail = EmailUtils.canonicalize(normalizedEmail);
        
        if (request.password() == null || request.password().length() < 8) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Password must be at least 8 characters long."));
        }
        String pwd = request.password();
        boolean hasLetter = pwd.chars().anyMatch(Character::isLetter);
        boolean hasDigit = pwd.chars().anyMatch(Character::isDigit);
        boolean hasSpecial = pwd.chars().anyMatch(ch -> "!@#$%^&*()_+-=[]{}|;':\",./<>?~`".indexOf(ch) >= 0);

        if (!hasLetter || !hasDigit || !hasSpecial) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Password must include at least one letter, one number, and one special character (!@#$%^&* etc.)."));
        }

        if (userRepository.findByEmail(normalizedEmail).isPresent() || userRepository.findByCanonicalEmail(canonicalEmail).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "Email is already registered."));
        }

        User user = User.builder()
                .email(normalizedEmail)
                .canonicalEmail(canonicalEmail)
                .passwordHash(passwordEncoder.encode(request.password()))
                .fullName(request.name() != null ? request.name().trim() : null)
                .role("USER")
                .build();

        userRepository.save(user);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("message", "User registered successfully."));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AuthRequest request) {
        if (!verifyTurnstile(request.turnstileToken())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Captcha verification failed."));
        }
        
        if (request.email() == null || request.password() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Invalid credentials."));
        }
        Optional<User> userOpt = userRepository.findByAnyEmail(request.email());
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (passwordEncoder.matches(request.password(), user.getPasswordHash())) {
                String pwd = request.password();
                boolean hasLetter = pwd.chars().anyMatch(Character::isLetter);
                boolean hasDigit = pwd.chars().anyMatch(Character::isDigit);
                boolean hasSpecial = pwd.chars().anyMatch(ch -> "!@#$%^&*()_+-=[]{}|;':\",./<>?~`".indexOf(ch) >= 0);

                if (pwd.length() < 8 || !hasLetter || !hasDigit || !hasSpecial) {
                    return ResponseEntity.status(HttpStatus.UPGRADE_REQUIRED).body(Map.of(
                        "message", "Your password does not meet our new security requirements. Please update it.",
                        "requiresPasswordReset", true
                    ));
                }
                
                String token = jwtTokenProvider.createToken(user.getEmail());
                return ResponseEntity.ok(new AuthResponse(token, com.digout.dto.UserProfileDTO.fromUser(user)));
            }
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Invalid credentials."));
    }
    
    @PostMapping("/update-password")
    public ResponseEntity<?> updatePassword(@RequestBody Map<String, String> request) {
        if (!verifyTurnstile(request.get("turnstileToken"))) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Captcha verification failed."));
        }

        String email = request.get("email");
        String oldPassword = request.get("oldPassword");
        String newPassword = request.get("newPassword");
        
        if (email == null || oldPassword == null || newPassword == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Missing fields"));
        }
        
        if (newPassword.length() < 8) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Password must be at least 8 characters long."));
        }
        boolean hasLetter = newPassword.chars().anyMatch(Character::isLetter);
        boolean hasDigit = newPassword.chars().anyMatch(Character::isDigit);
        boolean hasSpecial = newPassword.chars().anyMatch(ch -> "!@#$%^&*()_+-=[]{}|;':\",./<>?~`".indexOf(ch) >= 0);

        if (!hasLetter || !hasDigit || !hasSpecial) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Password must include at least one letter, one number, and one special character (!@#$%^&* etc.)."));
        }
        
        Optional<User> userOpt = userRepository.findByAnyEmail(email);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
                user.setPasswordHash(passwordEncoder.encode(newPassword));
                userRepository.save(user);
                String token = jwtTokenProvider.createToken(user.getEmail());
                return ResponseEntity.ok(new AuthResponse(token, com.digout.dto.UserProfileDTO.fromUser(user)));
            }
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Invalid credentials."));
    }
}
