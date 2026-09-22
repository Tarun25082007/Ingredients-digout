package com.digout.models;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "cached_analysis", indexes = {
    @Index(name = "idx_product_country", columnList = "productName, countryCode")
}, uniqueConstraints = {
    @UniqueConstraint(columnNames = {"productName", "countryCode"})
})
public class CachedAnalysis {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String productName;

    @Column(nullable = false, length = 32)
    private String countryCode = "world";

    @Column(columnDefinition = "TEXT", nullable = false)
    private String analysisResultJson;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        // Store in lowercase for case-insensitive exact matching
        this.productName = productName != null ? productName.toLowerCase().trim() : null;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public void setCountryCode(String countryCode) {
        String cc = countryCode != null ? countryCode.toLowerCase().trim() : "world";
        if (cc.length() > 32) cc = cc.substring(0, 32);
        this.countryCode = cc;
    }

    public String getAnalysisResultJson() {
        return analysisResultJson;
    }

    public void setAnalysisResultJson(String analysisResultJson) {
        this.analysisResultJson = analysisResultJson;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    /** Returns true if this entry is older than 30 days and should be evicted. */
    public boolean isStale() {
        return createdAt != null && createdAt.isBefore(LocalDateTime.now().minusDays(30));
    }
}
