package com.digout.controllers;

import com.digout.dto.ProductSuggestionDTO;
import com.digout.models.CachedAnalysis;
import com.digout.models.HealthStatus;
import com.digout.models.ScanHistory;
import com.digout.models.User;
import com.digout.repositories.CachedAnalysisRepository;
import com.digout.repositories.ScanHistoryRepository;
import com.digout.repositories.UserRepository;
import com.digout.dto.WhoAssessmentDTO;
import com.digout.services.GeminiService;
import com.digout.services.OpenFoodFactsService;
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
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/scan")
public class ScanController {

    private final GeminiService geminiService;
    private final OpenFoodFactsService openFoodFactsService;
    private final ScanHistoryRepository scanHistoryRepository;
    private final UserRepository userRepository;
    private final CachedAnalysisRepository cachedAnalysisRepository;
    private final ObjectMapper objectMapper;

    public ScanController(GeminiService geminiService, OpenFoodFactsService openFoodFactsService, ScanHistoryRepository scanHistoryRepository, UserRepository userRepository, CachedAnalysisRepository cachedAnalysisRepository, ObjectMapper objectMapper) {
        this.geminiService = geminiService;
        this.openFoodFactsService = openFoodFactsService;
        this.scanHistoryRepository = scanHistoryRepository;
        this.userRepository = userRepository;
        this.cachedAnalysisRepository = cachedAnalysisRepository;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/analyze")
    public CompletableFuture<ResponseEntity<Object>> analyzeImage(@RequestParam("file") MultipartFile file) throws IOException {
        byte[] bytes = file.getBytes();
        String base64Image = Base64.getEncoder().encodeToString(bytes);
        String mimeType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
        
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();

        return geminiService.analyzeIngredients(base64Image, mimeType)
                .thenApply(assessment -> {
                    saveScanHistory(auth, assessment);
                    return ResponseEntity.ok((Object) assessment);
                });
    }

    @PostMapping("/analyze-name")
    public CompletableFuture<ResponseEntity<Object>> analyzeName(@RequestBody java.util.Map<String, String> payload) {
        String productName = payload.get("productName");
        if (productName == null || productName.trim().isEmpty()) {
            throw new IllegalArgumentException("Product name is required");
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();

        Optional<CachedAnalysis> cachedOpt = cachedAnalysisRepository.findByProductNameIgnoreCase(productName.trim());
        if (cachedOpt.isPresent()) {
            try {
                WhoAssessmentDTO cachedAssessment = objectMapper.readValue(cachedOpt.get().getAnalysisResultJson(), WhoAssessmentDTO.class);
                saveScanHistory(auth, cachedAssessment);
                return CompletableFuture.completedFuture(ResponseEntity.ok((Object) cachedAssessment));
            } catch (Exception e) {
                System.err.println("Failed to parse cached JSON: " + e.getMessage());
                // Fallthrough to re-analyze if cache parse fails
            }
        }

        return geminiService.analyzeIngredientsByName(productName)
                .thenApply(assessment -> {
                    try {
                        String json = objectMapper.writeValueAsString(assessment);
                        CachedAnalysis cacheEntry = new CachedAnalysis();
                        cacheEntry.setProductName(productName);
                        cacheEntry.setAnalysisResultJson(json);
                        cachedAnalysisRepository.save(cacheEntry);
                    } catch (Exception e) {
                        System.err.println("Failed to cache analysis: " + e.getMessage());
                    }

                    saveScanHistory(auth, assessment);
                    return ResponseEntity.ok((Object) assessment);
                });
    }

    private void saveScanHistory(Authentication auth, WhoAssessmentDTO assessment) {
        if (auth != null && auth.isAuthenticated() && !auth.getPrincipal().equals("anonymousUser")) {
            String email = auth.getName();
            Optional<User> userOpt = userRepository.findByEmail(email);
            
            if (userOpt.isPresent()) {
                User user = userOpt.get();
                HealthStatus status;
                try {
                    status = HealthStatus.valueOf(assessment.overallIndicator().toUpperCase());
                } catch (IllegalArgumentException e) {
                    status = HealthStatus.YELLOW;
                }

                try {
                    ScanHistory history = ScanHistory.builder()
                            .user(user)
                            .productName(assessment.productName())
                            .rawOcrText("") 
                            .whoAssessmentJson(objectMapper.writeValueAsString(assessment))
                            .healthStatus(status)
                            .build();
                            
                    scanHistoryRepository.save(history);
                } catch (Exception dbEx) {
                    System.err.println("Failed to save scan history: " + dbEx.getMessage());
                }
            }
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

    @GetMapping("/autocomplete")
    public ResponseEntity<List<ProductSuggestionDTO>> autocomplete(@RequestParam("query") String query) {
        try {
            List<ProductSuggestionDTO> suggestions = openFoodFactsService.autocompleteProducts(query);
            return ResponseEntity.ok(suggestions);
        } catch (Exception e) {
            return ResponseEntity.ok(java.util.Collections.emptyList());
        }
    }
}
