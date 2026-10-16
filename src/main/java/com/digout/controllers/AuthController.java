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
import java.net.URI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.util.UriComponentsBuilder;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

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

    /** Checks that a password meets the complexity rules (8+ chars, upper, lower, digit, special). */
    private boolean isPasswordSecure(String pwd) {
        if (pwd == null || pwd.length() < 8) return false;
        return pwd.chars().anyMatch(Character::isUpperCase)
            && pwd.chars().anyMatch(Character::isLowerCase)
            && pwd.chars().anyMatch(Character::isDigit)
            && pwd.chars().anyMatch(ch -> "!@#$%^&*()_+-=[]{}|;':\",.//<>?~`".indexOf(ch) >= 0);
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
        
        if (!isPasswordSecure(request.password())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Password must include at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&* etc.)."));
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
                if (!isPasswordSecure(request.password())) {
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
        
        if (!isPasswordSecure(newPassword)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Password must include at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&* etc.)."));
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

    @org.springframework.beans.factory.annotation.Value("${google.client.id:599673748564-91607cjjv7fdd1c7n7erri8bc9mbl6mq.apps.googleusercontent.com}")
    private String googleClientId;

    @PostMapping("/google")
    public ResponseEntity<?> googleLogin(@RequestBody Map<String, String> request) {
        String idToken = request.get("idToken");
        if (idToken == null || idToken.isBlank()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Google ID token is required."));
        }

        try {
            URI uri = UriComponentsBuilder
                    .fromHttpUrl("https://oauth2.googleapis.com/tokeninfo")
                    .queryParam("id_token", idToken.trim())
                    .build()
                    .toUri();

            ResponseEntity<Map> tokenInfoResp = this.restTemplate.getForEntity(uri, Map.class);
            Map<String, Object> payload = tokenInfoResp.getBody();

            if (payload == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Invalid Google token response."));
            }

            String aud = (String) payload.get("aud");
            String azp = (String) payload.get("azp");
            String cleanExpected = googleClientId != null ? googleClientId.trim() : "";

            boolean audMatches = cleanExpected.equalsIgnoreCase(aud != null ? aud.trim() : "")
                              || cleanExpected.equalsIgnoreCase(azp != null ? azp.trim() : "");

            if (!audMatches) {
                log.warn("Google OAuth audience mismatch: expected='{}', aud='{}', azp='{}'", cleanExpected, aud, azp);
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "message", "Token audience mismatch. Expected: " + cleanExpected + ", got: " + aud
                ));
            }

            String iss = (String) payload.get("iss");
            if (iss == null || (!iss.equals("https://accounts.google.com") && !iss.equals("accounts.google.com"))) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Invalid token issuer."));
            }

            Object emailVerified = payload.get("email_verified");
            boolean isEmailVerified = Boolean.TRUE.equals(emailVerified) || "true".equalsIgnoreCase(String.valueOf(emailVerified));
            if (!isEmailVerified) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Google email is not verified."));
            }

            String email = (String) payload.get("email");
            if (email == null || email.isBlank()) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "No email provided in Google token."));
            }

            String sub = (String) payload.get("sub");
            String name = (String) payload.get("name");
            String normalizedEmail = email.trim().toLowerCase();
            String canonicalEmail = EmailUtils.canonicalize(normalizedEmail);

            // 1. Try to find user by Google ID (sub)
            Optional<User> userOpt = (sub != null && !sub.isBlank()) ? userRepository.findByGoogleId(sub) : Optional.empty();

            // 2. If not found by Google ID, try to find by email / canonical email
            if (userOpt.isEmpty()) {
                userOpt = userRepository.findByAnyEmail(normalizedEmail);
                if (userOpt.isPresent()) {
                    // Auto-link Google ID to existing account
                    User existingUser = userOpt.get();
                    if (sub != null && !sub.isBlank() && existingUser.getGoogleId() == null) {
                        existingUser.setGoogleId(sub);
                        userRepository.save(existingUser);
                    }
                }
            }

            User user;
            if (userOpt.isPresent()) {
                user = userOpt.get();
            } else {
                // 3. Create new user account
                user = User.builder()
                        .email(normalizedEmail)
                        .canonicalEmail(canonicalEmail)
                        .googleId(sub)
                        .fullName(name != null ? name.trim() : null)
                        .passwordHash(passwordEncoder.encode(java.util.UUID.randomUUID().toString()))
                        .role("USER")
                        .build();
                userRepository.save(user);
            }

            String token = jwtTokenProvider.createToken(user.getEmail());
            return ResponseEntity.ok(new AuthResponse(token, com.digout.dto.UserProfileDTO.fromUser(user)));

        } catch (HttpStatusCodeException e) {
            log.error("Google tokeninfo error: HTTP {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                "message", "Google verification failed. Please try again."
            ));
        } catch (Exception e) {
            log.error("Google login failed: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                "message", "Google authentication failed. Please try again."
            ));
        }
    }
}
