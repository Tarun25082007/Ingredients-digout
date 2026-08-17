package com.digout.controllers;

import com.digout.dto.WhoAssessmentDTO;
import com.digout.models.HealthStatus;
import com.digout.models.ScanHistory;
import com.digout.models.User;
import com.digout.repositories.ScanHistoryRepository;
import com.digout.repositories.UserRepository;
import com.digout.services.GeminiService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/scan")
public class ScanController {

    private final GeminiService geminiService;
    private final ScanHistoryRepository scanHistoryRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public ScanController(GeminiService geminiService, ScanHistoryRepository scanHistoryRepository, UserRepository userRepository, ObjectMapper objectMapper) {
        this.geminiService = geminiService;
        this.scanHistoryRepository = scanHistoryRepository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/analyze")
    public java.util.concurrent.CompletableFuture<ResponseEntity<Object>> analyzeImage(@RequestParam("file") MultipartFile file) {
        try {
            // Convert image to base64
            byte[] bytes = file.getBytes();
            String base64Image = Base64.getEncoder().encodeToString(bytes);

            // Call Gemini Service
            String mimeType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
            
            // Capture SecurityContext since @Async runs in a different thread
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();

            return geminiService.analyzeIngredients(base64Image, mimeType)
                    .thenApply(assessment -> {
                        // Check if user is authenticated (Optional Bearer Token)
                        if (auth != null && auth.isAuthenticated() && !auth.getPrincipal().equals("anonymousUser")) {
                            String email = auth.getName();
                            Optional<User> userOpt = userRepository.findByEmail(email);
                            
                            if (userOpt.isPresent()) {
                                User user = userOpt.get();
                                
                                // Parse health status (fallback to YELLOW if invalid)
                                HealthStatus status;
                                try {
                                    status = HealthStatus.valueOf(assessment.overallIndicator().toUpperCase());
                                } catch (IllegalArgumentException e) {
                                    status = HealthStatus.YELLOW;
                                }

                                // Save to scan history
                                try {
                                    ScanHistory history = ScanHistory.builder()
                                            .user(user)
                                            .productName(assessment.productName())
                                            .rawOcrText("") // Can be populated if separate OCR is used
                                            .whoAssessmentJson(objectMapper.writeValueAsString(assessment))
                                            .healthStatus(status)
                                            .build();
                                            
                                    scanHistoryRepository.save(history);
                                } catch (Exception dbEx) {
                                    System.err.println("Failed to save scan history: " + dbEx.getMessage());
                                }
                            }
                        }
                        return ResponseEntity.ok((Object) assessment);
                    })
                    .exceptionally(ex -> ResponseEntity.internalServerError().body((Object) java.util.Map.of("message", "An error occurred during analysis: " + ex.getMessage())));
            
        } catch (IOException e) {
            return java.util.concurrent.CompletableFuture.completedFuture(ResponseEntity.internalServerError().body((Object) java.util.Map.of("message", "Failed to process image file.")));
        } catch (Exception e) {
            return java.util.concurrent.CompletableFuture.completedFuture(ResponseEntity.internalServerError().body((Object) java.util.Map.of("message", "An error occurred during analysis: " + e.getMessage())));
        }
    }

    @GetMapping("/history")
    public ResponseEntity<?> getScanHistory() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal().equals("anonymousUser")) {
            return ResponseEntity.status(401).body("Unauthorized");
        }

        String email = auth.getName();
        Optional<User> userOpt = userRepository.findByEmail(email);
        
        if (userOpt.isPresent()) {
            List<ScanHistory> history = scanHistoryRepository.findByUserIdOrderByScannedAtDesc(userOpt.get().getId());
            return ResponseEntity.ok(history);
        }
        
        return ResponseEntity.status(404).body("User not found");
    }
}
