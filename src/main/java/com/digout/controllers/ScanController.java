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
import com.digout.services.UsdaFoodDataService;
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
    private final UsdaFoodDataService usdaFoodDataService;
    private final ScanHistoryRepository scanHistoryRepository;
    private final UserRepository userRepository;
    private final CachedAnalysisRepository cachedAnalysisRepository;
    private final ObjectMapper objectMapper;

    public ScanController(GeminiService geminiService, 
                          OpenFoodFactsService openFoodFactsService, 
                          UsdaFoodDataService usdaFoodDataService,
                          ScanHistoryRepository scanHistoryRepository, 
                          UserRepository userRepository, 
                          CachedAnalysisRepository cachedAnalysisRepository, 
                          ObjectMapper objectMapper) {
        this.geminiService = geminiService;
        this.openFoodFactsService = openFoodFactsService;
        this.usdaFoodDataService = usdaFoodDataService;
        this.scanHistoryRepository = scanHistoryRepository;
        this.userRepository = userRepository;
        this.cachedAnalysisRepository = cachedAnalysisRepository;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/analyze")
    public CompletableFuture<ResponseEntity<Object>> analyzeImage(
            @RequestParam("file") MultipartFile file, 
            @RequestParam(value = "foodCategory", defaultValue = "packaged") String foodCategory,
            @RequestParam(value = "language", defaultValue = "English") String language,
            @RequestParam(value = "countryCode", defaultValue = "world") String countryCode) throws IOException {
        // Validate MIME type - reject non-image files to prevent abuse
        String mimeType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
        if (!mimeType.startsWith("image/")) {
            return CompletableFuture.completedFuture(
                ResponseEntity.badRequest().body((Object) java.util.Map.of("message", "Only image files are accepted. Please upload a JPEG, PNG, or WEBP file."))
            );
        }
        
        byte[] bytes = file.getBytes();
        String base64Image = Base64.getEncoder().encodeToString(bytes);
        
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String userProfileSummary = buildUserProfileSummary(auth);

        return geminiService.analyzeIngredients(base64Image, mimeType, foodCategory, userProfileSummary, language)
                .thenCompose(assessment -> {
                    // Check if the AI returned NO ingredients (front of pack fallback)
                    if (assessment.ingredientsFound() == null || assessment.ingredientsFound().isEmpty()) {
                        String identifiedName = assessment.productName();
                        if (identifiedName == null || identifiedName.isBlank()) {
                            identifiedName = "Unknown Product";
                        }
                        return processAnalyzeNameLogic(identifiedName, countryCode, language, foodCategory, false, userProfileSummary, auth, true, true);
                    }
                    saveScanHistory(auth, assessment);
                    return CompletableFuture.completedFuture(ResponseEntity.ok((Object) assessment));
                });
    }

    @PostMapping("/analyze-name")
    public CompletableFuture<ResponseEntity<Object>> analyzeName(@RequestBody java.util.Map<String, String> payload) {
        String productName = payload.get("productName");
        String countryCode = payload.getOrDefault("countryCode", "world");
        String language = payload.getOrDefault("language", "English");
        
        if (productName == null || productName.trim().isEmpty()) {
            throw new IllegalArgumentException("Product name is required");
        }
        // Sanitize: cap length to prevent DB column overflow attacks
        productName = productName.trim();
        if (productName.length() > 255) {
            productName = productName.substring(0, 255);
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String userProfileSummary = buildUserProfileSummary(auth);
        String foodCategory = payload.getOrDefault("foodCategory", "packaged");
        boolean forceAi = Boolean.parseBoolean(payload.getOrDefault("forceAi", "false"));
        boolean saveHistory = Boolean.parseBoolean(payload.getOrDefault("saveHistory", "true"));

        return processAnalyzeNameLogic(productName, countryCode, language, foodCategory, forceAi, userProfileSummary, auth, false, saveHistory);
    }

    private CompletableFuture<ResponseEntity<Object>> processAnalyzeNameLogic(
            String productName, String countryCode, String language, String foodCategory, 
            boolean forceAi, String userProfileSummary, Authentication auth, boolean fromImageFallback, boolean saveHistory) {

        // Only use generic cache if user has no personalized health profile AND language is English
        if (userProfileSummary == null && "English".equalsIgnoreCase(language)) {
            Optional<CachedAnalysis> cachedOpt = cachedAnalysisRepository.findByProductNameIgnoreCaseAndCountryCodeIgnoreCase(productName.trim(), countryCode);
            if (cachedOpt.isPresent()) {
                try {
                    WhoAssessmentDTO cachedAssessment = objectMapper.readValue(cachedOpt.get().getAnalysisResultJson(), WhoAssessmentDTO.class);
                    if (fromImageFallback) {
                        cachedAssessment = addImageFallbackAlert(cachedAssessment);
                    }
                    if (saveHistory) {
                        saveScanHistory(auth, cachedAssessment);
                    }
                    return CompletableFuture.completedFuture(ResponseEntity.ok((Object) cachedAssessment));
                } catch (Exception e) {
                    System.err.println("Failed to parse cached JSON: " + e.getMessage());
                }
            }
        }

        // Fetch exact ingredients from database first based on country (skip if forceAi)
        String exactIngredients = null;
        String servingSize = null;
        String quantity = null;
        String dataSourceRegion = forceAi ? null : countryCode;
        
        if (!forceAi) {
            if ("fresh".equals(foodCategory)) {
                try {
                    com.digout.dto.OpenFoodFactsDTO dbProduct = usdaFoodDataService.searchFreshProductByName(productName);
                    exactIngredients = dbProduct.ingredientsText();
                    servingSize = dbProduct.servingSize();
                    quantity = dbProduct.quantity();
                    dataSourceRegion = "usda_foundation";
                } catch (Exception e) {
                    System.err.println("Could not fetch exact ingredients from USDA for fresh food: " + e.getMessage());
                    dataSourceRegion = null; // AI fallback
                }
            } else {
                // Tier 1: Regional Open Food Facts Database
                try {
                    com.digout.dto.OpenFoodFactsDTO dbProduct = openFoodFactsService.searchProductByName(productName, countryCode);
                    if (dbProduct != null && dbProduct.ingredientsText() != null && !dbProduct.ingredientsText().isBlank()) {
                        exactIngredients = dbProduct.ingredientsText();
                        servingSize = dbProduct.servingSize();
                        quantity = dbProduct.quantity();
                        dataSourceRegion = countryCode;
                    }
                } catch (Exception e) {
                    System.out.println("Tier 1 (Regional database) missed for " + productName + ": " + e.getMessage());
                }

                // Tier 2: Global Open Food Facts Database
                if ((exactIngredients == null || exactIngredients.isBlank()) && !"world".equalsIgnoreCase(countryCode)) {
                    try {
                        System.out.println("Checking Tier 2 (Global Open Food Facts) for " + productName);
                        com.digout.dto.OpenFoodFactsDTO globalProduct = openFoodFactsService.searchProductByName(productName, "world");
                        if (globalProduct != null && globalProduct.ingredientsText() != null && !globalProduct.ingredientsText().isBlank()) {
                            exactIngredients = globalProduct.ingredientsText();
                            if (servingSize == null) servingSize = globalProduct.servingSize();
                            if (quantity == null) quantity = globalProduct.quantity();
                            dataSourceRegion = "world_fallback";
                        }
                    } catch (Exception e) {
                        System.out.println("Tier 2 (Global Open Food Facts) missed for " + productName);
                    }
                }

                // Tier 3: USDA FoodData Central (Branded Foods Database)
                if (exactIngredients == null || exactIngredients.isBlank()) {
                    try {
                        System.out.println("Checking Tier 3 (USDA FoodData Central) for " + productName);
                        com.digout.dto.OpenFoodFactsDTO usdaProduct = usdaFoodDataService.searchAnyProductByName(productName);
                        if (usdaProduct != null && usdaProduct.ingredientsText() != null && !usdaProduct.ingredientsText().isBlank()) {
                            exactIngredients = usdaProduct.ingredientsText();
                            if (servingSize == null) servingSize = usdaProduct.servingSize();
                            if (quantity == null) quantity = usdaProduct.quantity();
                            dataSourceRegion = "usda_database";
                            System.out.println("Tier 3 (USDA FoodData Central) MATCHED for " + productName);
                        }
                    } catch (Exception e) {
                        System.out.println("Tier 3 (USDA FoodData Central) missed for " + productName);
                    }
                }

                // Tier 4: Fallback to AI (exactIngredients = null) if no database has the ingredients
                if (exactIngredients == null || exactIngredients.isBlank()) {
                    System.out.println("All databases checked without ingredients. Seamlessly falling back to AI for " + productName);
                    dataSourceRegion = null;
                }
            }
        }
        final String finalDataSourceRegion = dataSourceRegion;
        return geminiService.analyzeIngredientsByName(productName, exactIngredients, servingSize, quantity, foodCategory, userProfileSummary, language)
                .thenApply(assessment -> {
                    WhoAssessmentDTO finalAssessment = new WhoAssessmentDTO(
                            assessment.productName(),
                            assessment.ingredientsFound(),
                            assessment.whoFlags(),
                            assessment.overallIndicator(),
                            assessment.globalEquivalent(),
                            assessment.servingSize(),
                            assessment.quantity(),
                            finalDataSourceRegion,
                            assessment.personalizedAlerts(),
                            assessment.recommendedServingAdvice()
                    );
                    
                    if (fromImageFallback) {
                        finalAssessment = addImageFallbackAlert(finalAssessment);
                    }

                    if (userProfileSummary == null && "English".equalsIgnoreCase(language)) {
                        try {
                            String json = objectMapper.writeValueAsString(finalAssessment);
                            CachedAnalysis cacheEntry = new CachedAnalysis();
                            cacheEntry.setProductName(productName.trim());
                            cacheEntry.setCountryCode(countryCode);
                            cacheEntry.setAnalysisResultJson(json);
                            cachedAnalysisRepository.save(cacheEntry);
                        } catch (Exception e) {
                            System.err.println("Failed to cache analysis: " + e.getMessage());
                        }
                    }
                    if (saveHistory) {
                        saveScanHistory(auth, finalAssessment);
                    }
                    return ResponseEntity.ok((Object) finalAssessment);
                });
    }

    private WhoAssessmentDTO addImageFallbackAlert(WhoAssessmentDTO assessment) {
        java.util.List<WhoAssessmentDTO.PersonalizedAlert> alerts = new java.util.ArrayList<>();
        if (assessment.personalizedAlerts() != null) {
            alerts.addAll(assessment.personalizedAlerts());
        }
        alerts.add(0, new WhoAssessmentDTO.PersonalizedAlert(
            "Visual Ingredients Missing",
            "Ingredients were not clearly legible on the packaging. Health assessment is based on the official database recipe for this product (which may vary slightly by region).",
            "YELLOW"
        ));
        return new WhoAssessmentDTO(
            assessment.productName(),
            assessment.ingredientsFound(),
            assessment.whoFlags(),
            assessment.overallIndicator(),
            assessment.globalEquivalent(),
            assessment.servingSize(),
            assessment.quantity(),
            assessment.dataSourceRegion(),
            alerts,
            assessment.recommendedServingAdvice()
        );
    }

    private String buildUserProfileSummary(Authentication auth) {
        if (auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getPrincipal())) {
            String email = auth.getName();
            Optional<User> userOpt = userRepository.findByEmail(email);
            if (userOpt.isPresent()) {
                User u = userOpt.get();
                if (Boolean.TRUE.equals(u.getProfileCompleted())) {
                    StringBuilder sb = new StringBuilder();
                    if (u.getAge() != null) sb.append("Age: ").append(u.getAge()).append(", ");
                    if (u.getGender() != null) sb.append("Gender: ").append(u.getGender()).append(", ");
                    if (u.getHeightCm() != null && u.getWeightKg() != null && u.getHeightCm() > 0) {
                        double hm = u.getHeightCm() / 100.0;
                        double bmi = Math.round((u.getWeightKg() / (hm * hm)) * 10.0) / 10.0;
                        sb.append("Height: ").append(u.getHeightCm()).append("cm, Weight: ").append(u.getWeightKg()).append("kg (BMI: ").append(bmi).append("), ");
                    }
                    if (u.getActivityLevel() != null) sb.append("Activity: ").append(u.getActivityLevel()).append(", ");
                    if (u.getCalorieGoal() != null) sb.append("Calorie Goal: ").append(u.getCalorieGoal()).append(", ");
                    if (u.getMedicalConditions() != null && !u.getMedicalConditions().isBlank()) {
                        sb.append("Conditions/Stages/Allergies: [").append(u.getMedicalConditions()).append("]");
                    }
                    if ("STRICT".equalsIgnoreCase(u.getStrictnessLevel())) {
                        sb.append(" | STRICTNESS LEVEL: STRICT (ZERO TOLERANCE for added sugars, refined seed oils, and artificial additives. MUST flag them ALL as RED or PURPLE).");
                    }
                    return sb.toString();
                }
            }
        }
        return null;
    }

    private void saveScanHistory(Authentication auth, WhoAssessmentDTO assessment) {
        if (auth != null && auth.isAuthenticated() && !auth.getPrincipal().equals("anonymousUser")) {
            String email = auth.getName();
            Optional<User> userOpt = userRepository.findByEmail(email);
            
            if (userOpt.isPresent()) {
                User user = userOpt.get();
                HealthStatus status = HealthStatus.YELLOW;
                try {
                    if (assessment.overallIndicator() != null) {
                        status = HealthStatus.valueOf(assessment.overallIndicator().toUpperCase());
                    }
                } catch (Exception e) {
                    status = HealthStatus.YELLOW;
                }

                try {
                    String pName = assessment.productName() != null ? assessment.productName() : "Unknown Product";
                    
                    if (!"Unknown Product".equalsIgnoreCase(pName)) {
                        scanHistoryRepository.deleteByUserIdAndProductNameIgnoreCase(user.getId(), pName);
                    }

                    ScanHistory history = ScanHistory.builder()
                            .user(user)
                            .productName(pName)
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
    public ResponseEntity<List<ProductSuggestionDTO>> autocomplete(@RequestParam("query") String query, @RequestParam(value = "countryCode", defaultValue = "world") String countryCode) {
        try {
            List<ProductSuggestionDTO> suggestions = openFoodFactsService.autocompleteProducts(query, countryCode);
            return ResponseEntity.ok(suggestions);
        } catch (Exception e) {
            return ResponseEntity.ok(java.util.Collections.emptyList());
        }
    }

    @DeleteMapping("/history/{id}")
    public ResponseEntity<?> deleteScanHistory(@PathVariable Long id) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal().equals("anonymousUser")) {
            return ResponseEntity.status(401).body(java.util.Map.of("message", "Unauthorized"));
        }

        String email = auth.getName();
        Optional<User> userOpt = userRepository.findByEmail(email);
        
        if (userOpt.isPresent()) {
            Optional<ScanHistory> historyOpt = scanHistoryRepository.findById(id);
            if (historyOpt.isPresent() && historyOpt.get().getUser().getId().equals(userOpt.get().getId())) {
                scanHistoryRepository.deleteById(id);
                return ResponseEntity.ok(java.util.Map.of("message", "History item deleted."));
            }
            return ResponseEntity.status(404).body(java.util.Map.of("message", "History item not found or unauthorized."));
        }
        
        return ResponseEntity.status(404).body(java.util.Map.of("message", "User not found"));
    }

    @GetMapping("/clear-cache")
    public ResponseEntity<?> clearCache() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            return ResponseEntity.status(401).body(java.util.Map.of("message", "Unauthorized"));
        }
        Optional<User> userOpt = userRepository.findByEmail(auth.getName());
        if (userOpt.isEmpty() || !"ADMIN".equalsIgnoreCase(userOpt.get().getRole())) {
            return ResponseEntity.status(403).body(java.util.Map.of("message", "Forbidden: Admin access required"));
        }
        cachedAnalysisRepository.deleteAll();
        return ResponseEntity.ok(java.util.Map.of("message", "Cache cleared successfully!"));
    }
}
